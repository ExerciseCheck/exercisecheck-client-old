var Kinect2 = require('kinect2'),
	express = require('express'),
	app = express(),
	server = require('http').createServer(app),
  spawn = require('child_process').spawn,
	io = require('socket.io').listen(server),
	XLSX = require('xlsx'),
  numeric = require('numeric');
const fs = require('fs');

var kinect = new Kinect2();
var clients = 0;
if(kinect.open()) {
	// Server Initiation
	server.listen(8000);
	console.log('Server listening on port 8000');
	console.log('Point your browser to http://localhost:8000');
	app.use(express.static('public'));

	// Initiation

	// States and sub-state, global variables in server
	var systemState = 3, // 3 is the initiation code || 1: recording, 2: display, 0: live, 3: init == live
			activityLabeled = false;

	// Data Storage, global variables in server
	var	bufferTrial= [], // trial is a number of activities, including ground truth (gt) and exercises
			bufferBodyFrames =[], gtArray = [], exArray = [];
	// Use this to find out current position we reached in reference.
	var refPos = 0;
	var actionStart = false;
	var actionTimeCount = 3, actionLastTime=0;
	var last_recJoints = null;
	var python_running = false, python_result =[100, [1]];

	// Start Time for the test
	var startTime, duration;
	var bodyIndex = -1;

	console.log('system init state');
	kinect.openBodyReader();

	// Connection On:
	io.on('connection', function(socket){
		++clients;
		console.log('a user connected');
		// systemState could be 0..3 during connection event, but only 2 needs signal emission
		if (systemState === 2) {
			socket.emit('disp',bufferBodyFrames,systemState, bodyIndex, activityLabeled);
		}

		// State Transition controlled by the client's command
		socket.on('command',function(){
			systemState = StateTrans(systemState);
			switch (systemState) { // During the transition, prepare the buffer
				case 1: // 0->1 or 3->1 Get ready for recording
					activityLabeled = false;
					bodyIndex = locateBodyTrackedIndex(bufferBodyFrames);
					bufferBodyFrames = [];
					console.log('System in Recording state');
					startTime = new Date().getTime();
					refPos = 0;
					actionStart=false;
					headStart=false;
					actionTimeCount=3;
					break;

				case 2: // 1->2, Push the BodyFrames Data to the current trial
					duration = ((new Date().getTime() - startTime)/1000).toFixed(2);
					kinect.closeBodyReader(); // if closeBodyReader is called twice, the server is down.
					bufferBodyFrames.durationsecs = duration;
					bufferBodyFrames.duration = duration.toString();
					bufferBodyFrames.bodyIndex = bodyIndex;
					bodyIndex = -1;
					//console.log(JSON.stringify(bufferBodyFrames));
					bufferTrial.push(bufferBodyFrames);
					console.log('system in Result Display state'); // Action
					socket.emit('disp',bufferBodyFrames,systemState, bodyIndex, activityLabeled); // activityLabeled should be false because recording is just ended
					socket.broadcast.emit('disp',bufferBodyFrames,systemState, bodyIndex, activityLabeled);
					break;

				case 0: // 2->0, get the system from Result Disp to Live state.
          console.log("Buffer Length: ", bufferTrial.length);
          console.log("Reference Index: ", (gtArray).toString());
          console.log("Exercise index: ", (exArray).toString());
					kinect.openBodyReader();// No Other Specific Actions in this block because it is done by kinect.on()
					console.log('system in Live state');
					break;
				default:
				  console.log("Something wrong, you should never see this");
			}
		});
		// Speical Buttons: label buttons(3), report button(1), save(1) & curve show(1)
		socket.on('dataLabelFromClient',function(num){ // label reference, exercise or discard
			testID = bufferTrial.length-1;
			if (gtArray[gtArray.length-1] === testID) { gtArray.pop(); }
			if (exArray[exArray.length-1] === testID) { exArray.pop(); }
						if (num === 1) { gtArray.push(testID); }
			else{	if (num === 2) { exArray.push(testID); } }
			activityLabeled = true;
			socket.emit('serverDataLabeled');
			socket.broadcast.emit('serverDataLabeled');
		});

		socket.on('analyze',function(){
	    console.log('analyze signal received!');
			var chartData = chartAnalyze(bufferTrial,gtArray,exArray);
			var barData = barAnalyze(bufferTrial, gtArray, exArray);
	    socket.emit('report',chartData, barData, gtArray, exArray);
    });

		socket.on('saveRequest',function(filename){
			save2xlsx(bufferTrial,gtArray,exArray,filename);
		});

		socket.on('curveRequest',function(gtInd,exInd,jt,datatype){
			var curveData = curveAnalyze(bufferTrial,gtArray,exArray,gtInd,exInd,jt,datatype);
			socket.emit('curveResult',curveData);
		});

		socket.on("save", function(){
		  console.log("Received save data signal");
		  re_data = [];
		  ex_data = [];
      for(var i=0; i<bufferTrial.length; i++){
		    if (i in gtArray){re_data.push(bufferTrial[i]);}
		    else if(i in exArray){ex_data.push(bufferTrial[i]);}
      }
      fs.writeFile("ref_data.json", JSON.stringify(re_data, null, "  "), function(err){if(err){return console.log(err);}});
      console.log("Reference Data saved.");
      fs.writeFile("exe_data.json", JSON.stringify(ex_data, null, "  "), function(err){if(err){return console.log(err);}});
      console.log("Exercise Data saved.");
    });

		var noDuplicateTS = 0;
		var lastSecond = 0;
		var fps = 0;
		var lastFrameMicroS = 0;
		// States
		kinect.on('bodyFrame', function(bodyFrame){
		  var currentTime = (new Date().getTime()/1000).toFixed(0);
		  var currentTimeMicroS = (new Date().getTime()).toFixed(0);
		  if (currentTimeMicroS - lastFrameMicroS < 80){
		    return;
      }
      else{
		    lastFrameMicroS = currentTimeMicroS;
      }
		  if(currentTime != lastSecond){
		    //console.log("FPS: ", fps);
		    fps = 1;
		    lastSecond = currentTime;
      }
      else{
		    fps += 1;
      }
			if( currentTime % 5 === 0 && currentTime !== noDuplicateTS){
			  var body_detected = bodyFrame.bodies.reduce(function (x, y){return x || y.tracked;}, false);
			  if (!body_detected){
			    console.log("Warning ["+currentTime.toString()+"]: No body detected!");
        }
        else{
          //console.log("Info ["+currentTime.toString()+"]: body frame received...");
          bodyFrame.bodies.forEach(function(element){
            if(element.tracked){
              //console.log(JSON.stringify(element));
            }
          });
        }
        noDuplicateTS = currentTime;
      }
			//console.log(JSON.stringify(bodyFrame));

			switch (systemState) {
				case 1: //recording: save the data being recorded, give identification to client
          // Check if we can start to send out reference
          if ('joints' in bodyFrame.bodies[bodyIndex] && !actionStart){
            // Condition 1: Head in center circle
            var headPos = bodyFrame.bodies[bodyIndex].joints[2];
            var headReady = (((headPos.depthX - 0.5) ** 2 + (headPos.depthY - 0.2) ** 2) <= 0.1 ** 2);
            // Condition 2: Position start, given head is ready
            if (headReady){
              if (gtArray.length > 0) {
                // Use least square (affine transformation) to compare similarity between current position with ref
                var body_index = locateBodyTrackedIndex([bufferTrial[gtArray[gtArray.length - 1]][0]]);
                var frameBody_index = locateBodyTrackedIndex([bodyFrame]);
                var joints1 = bufferTrial[gtArray[gtArray.length-1]][0].bodies[body_index].joints;
                var joints2 = bodyFrame.bodies[frameBody_index].joints;
                var points_list = [...Array(Math.min(joints1.length, joints2.length)).keys()];
                var x = [], y = [];
                points_list.map(function (point_index) {
                  // Add one extra dimension 1, used for translation
                  x.push([joints1[point_index].depthX, joints1[point_index].depthY, 1]);
                  y.push([joints2[point_index].depthX, joints2[point_index].depthY, 1]);
                });
                python_result = lstsq(x, y);
                if(python_result[0] < 1){
                  console.log("Passed posture detection using least square");
                  actionStart = true;
                }
              } // End of if (gtArray.length > 0) : if
              else{
                // If reference not defined, use common points to detect action start
                if (last_recJoints === null)
                  last_recJoints = bodyFrame.bodies[bodyIndex].joints;
                var c_p = distance_joint2joints_commonPoints({joints1: last_recJoints, joints2:bodyFrame.bodies[bodyIndex].joints, pointThreshold: 0.1});
                if (c_p > last_recJoints.length - 5) {
                  last_recJoints = bodyFrame.bodies[bodyIndex].joints;
                  console.log("current common points ", c_p);
                }
                else{
                  console.log("Passed posture detection using commonpoints");
                  actionStart = true;
                  last_recJoints = null;
                }
              } // End of if (gtArray.length > 0) : else
            }
            else{
              // If head is not ready, just show first frame of reference, if there is any ref
              if (gtArray.length > 0) {
                var body_index = locateBodyTrackedIndex([bufferTrial[gtArray[gtArray.length - 1]][refPos]]);
                var refData = bufferTrial[gtArray[gtArray.length - 1]][0].bodies[body_index];
                if (refData !== null) {
                  socket.emit('recRef', refData);
                  socket.broadcast.emit('refRef', refData);
                }
              }
            } // End of: if(headReady)
          }

          if(gtArray.length > 0 && actionStart){
            // If action started, Prepare and emit reference data.
            // countdown and show countdown number
            if (actionTimeCount >= 0){
              socket.emit('recRefCountdown', actionTimeCount);
              socket.broadcast.emit('recRefCountdown', actionTimeCount);

              var c_t = (new Date().getTime()/1000).toFixed(0);
              if (c_t - actionLastTime >= 1){
                actionLastTime = c_t;
                actionTimeCount -= 1;
              }
              else {
                // Only start rest recording when countdown is over, otherwise just update recording canvas
                socket.emit('rec', bodyFrame, systemState, bodyIndex);
                socket.broadcast.emit('rec', bodyFrame, systemState, bodyIndex);
                break;
              }
            }
            else {
              // When countdown is over, update reference
              var body_index = locateBodyTrackedIndex([bufferTrial[gtArray[gtArray.length - 1]][refPos]]);
              var refData = bufferTrial[gtArray[gtArray.length - 1]][refPos].bodies[body_index];
              if (refData !== null) {
                socket.emit('recRef', refData);
                socket.broadcast.emit('refRef', refData);
              }
              // Move reference index, can use this to control replay speed
              refPos += 1;
              // If meet end of reference, replay it
              if (refPos >= bufferTrial[gtArray[gtArray.length - 1]].length) {
                refPos = 0;
              }
            }
          }

          // normal rec data
					socket.emit('rec', bodyFrame, systemState, bodyIndex);
					socket.broadcast.emit('rec', bodyFrame, systemState, bodyIndex);
					if(actionStart){
            // save the bodyFrame by pushing it to buffer, only save frame when actionStart. Once it start, it will keep recording
					  bufferBodyFrames.push(bodyFrame);
					}
					break;

				case 2: //display
					console.log('system in display state, but system is streaming. Something wrong here.');
					break;

				case 0: //live
          if (gtArray.length > 0) {
            var body_index = locateBodyTrackedIndex([bufferTrial[gtArray[gtArray.length - 1]][refPos]]);
            var refData = bufferTrial[gtArray[gtArray.length - 1]][refPos].bodies[body_index];
            if (refData !== null) {
              socket.emit('recRef', refData);
              socket.broadcast.emit('refRef', refData);
            }
            // Move reference index
            refPos += 1;
            // If meet end of reference, replay it
            if (refPos >= bufferTrial[gtArray[gtArray.length - 1]].length) {
              refPos = 0;
            }
          }
					bufferBodyFrames = [];
					bufferBodyFrames.push(bodyFrame); // clean buffer and push the current bodyFrame to buffer. It is used to find the (1) bodyIndex to track.
					socket.emit('live', bodyFrame,systemState);
					socket.broadcast.emit('live', bodyFrame,systemState);
					break;

				case 3: //3 init
					bufferBodyFrames = [];
					bufferBodyFrames.push(bodyFrame);
					socket.emit('init', bodyFrame, systemState);
					socket.broadcast.emit('init', bodyFrame, systemState);
					break;

				default:
					console.log('System State unknown');
			}//end of switch
		}); // end of kinect.on('bodyframe',function)

		// disconnect
		socket.on('disconnect',function(){
			console.log('a user disconnect');
			--clients;
		})
	}); // end of io.on('connection',function)
}//end of kinect.open()


// Functions ----------------------------------------------------------------------

// Define the legal move between states
function StateTrans(st){
	return (st+1)%3;
}

function locateBodyTrackedIndex(bufferBodyFrames){
	var ind = -1;
	for (var i=0; i<=5; i++){
		if (bufferBodyFrames[0].bodies[i].tracked){ // tracked in the first frame
			ind = i;
			break;
		}
	}
	return ind;
}

function typeofTest(bufferTrial,id){
	var type // 0: Hand, 1: Squat
	var typeList = ["Hand","Squat"];
	if (getAmplitudeY(bufferTrial,id,0) > 0.15) //Base of spine moves > 0.15m
		{type = "Squat";}
	else
		{ type = "Hand";}
	return type;
}

function getRaw(bufferTrial,id,jt,datatype){
	var frames = bufferTrial[id];
	var ind = frames.bodyIndex, time = frames.durationsecs;
	var rawdata = []
	for(var i=0; i<frames.length; i++){
		if (datatype == 0)
			{rawdata.push(frames[i].bodies[ind].joints[jt].cameraX);}
		if (datatype == 1)
			{rawdata.push(frames[i].bodies[ind].joints[jt].cameraY);}
		if (datatype == 2)
			{rawdata.push(frames[i].bodies[ind].joints[jt].cameraZ);}
		else{
			var x = frames[i].bodies[ind].joints[jt].orientationX;
			var y = frames[i].bodies[ind].joints[jt].orientationY;
			var z = frames[i].bodies[ind].joints[jt].orientationZ;
			var w = frames[i].bodies[ind].joints[jt].orientationW;

			var T_x = 180 + 180/3.1416*Math.atan2( 2*y*z+2*x*w,1-2*x*x - 2*y*y); // leaning forward/backward
			var T_y = 180/3.1416*Math.asin(2*y*w-2*x*z);                   // turning
			var T_z = 180 + 180/3.1416*Math.atan2( 2*x*y + 2*z*w,1 - 2*y*y - 2*z*z); // leaning left
			while (T_x>90) {T_x += -180;}
			if (T_y>180) {T_y += -180;}
			if (T_z>180) {T_z += -180;}
			if (datatype == 3)
				{rawdata.push(T_x);}
			if (datatype == 4)
				{rawdata.push(T_y);}
			if (datatype == 5)
				{rawdata.push(T_z);}

		}
	}
	return rawdata;
}

/*
Description: Javascript implementation of least square method. It computes the weight W that minimizes the square
L2 norm of Y - XW. If Y is a matrix rather than a vector, It returns the lstsq result for each column of Y. i.e.
W = [W_1, W_2,....,W_n] where W_n = lstsq(X,Y_n), a column vector.
Parameters:
    X: N by M array
    Y; N by K array
Returns:
    W: M by K array
 */
function lstsq(X, Y)
{
  //get dimensions
  var K = Y[0].length;
  var N = Y.length;
  var M = X[0].length;

  //out put array
  var W = [];

  //compute each W_n
  for(n = 0; n < K; n++)
  {
    var Y_n = numeric.transpose(Y).slice(n, n + 1);
    Y_n = numeric.transpose(Y_n);
    // X^T dot X
    var w_n = numeric.dot(numeric.transpose(X),X);
    //X^T dot X inverse
    w_n = numeric.inv(w_n);
    //X^T dot X inverse dot x^T
    w_n = numeric.dot(w_n, numeric.transpose(X));
    //dot y
    w_n = numeric.dot(w_n, Y_n);
    W[n] = w_n;
  }
  W = numeric.transpose(W);

  // Calculate error
  var After_trans = numeric.dot(X, W);
  var err = 0;
  for (i = 0; i < After_trans.length; i++){
    for (j = 0; j < After_trans[0].length; j++){
      err = (After_trans[i][j] - Y[i][j]) ** 2;
    }
  }
  var result = [err, W];
  return result;
}

function lstsq_python(joints1, joints2){
  if (!python_running) {
    python_running = true;
    var points_list = [...Array(Math.min(joints1.length, joints2.length)).keys()];
    var x = [], y = [];
    points_list.map(function (point_index) {
      x.push([joints1[point_index].depthX, joints1[point_index].depthY]);
      y.push([joints2[point_index].depthX, joints2[point_index].depthY]);
    });
    var affine_py = spawn('python', ['affine_transformation.py']);
    var output = null;
    affine_py.on('error', function (err) {
      console.log("failed to start python process")
    });
    affine_py.stdout.on('data', function (data) {
      //console.log("***: ", data.toString());
      python_result = JSON.parse(data.toString());
      console.log(python_result[0]);
    });
    //affine_py.stdout.on('end', function(){console.log("we get least square error: ",output)});
    affine_py.stderr.on('data', function (data) {
      console.log("error! ", data.toString());
    });
    affine_py.stdio[0].write(JSON.stringify([x, y]));
    affine_py.stdio[0].end();
    affine_py.on('close', function(code){python_running=false;});
    //affine_py.on('close', function(code){console.log("returned code ${code}")});
  }
}

function distance_joint2joints_commonPoints(parameters){
  var joints1 = parameters.joints1;
  var joints2 = parameters.joints2;
  var pointThreshold = pointThreshold in parameters? parameters.pointThreshold: 0.01;
  // Only calculate common parts' common points, common points means points that didn't move much
  var joint_list = [...Array(Math.min(joints1.length, joints2.length)).keys()];
  return joint_list.reduce(function(sum, joint_index){
    if (((joints1[joint_index].depthX-joints2[joint_index].depthX)**2+(joints1[joint_index].depthY-joints2[joint_index].depthY)**2) <= pointThreshold**2){
      return sum + 1;
    }
    return sum
  }, 0)
}

function distance_joints2joints_euclidean(parameters){
  var joints1 = parameters.joints1;
  var joints2 = parameters.joints2;
  // Only calculate common parts' distance
  var joint_list = [...Array(Math.min(joints1.length, joints2.length)).keys()];
  return joint_list.reduce(function(sum, joint_index){
    return sum + (joints1[joint_index] - joints2[joint_index])**2
  }, 0);
}

function getSpeed(bufferTrial,id,jt){
	var frames = bufferTrial[id];
	var ind = frames.bodyIndex, time = frames.durationsecs;
	var accumDist = 0, speed = 0;
	for(var i=0; i<frames.length-1; i++){
		var dY = frames[i+1].bodies[ind].joints[jt].cameraY-frames[i].bodies[ind].joints[jt].cameraY,
				dX = frames[i+1].bodies[ind].joints[jt].cameraX-frames[i].bodies[ind].joints[jt].cameraX,
				dZ = frames[i+1].bodies[ind].joints[jt].cameraZ-frames[i].bodies[ind].joints[jt].cameraZ;
		var dist = Math.sqrt(Math.pow(dX,2) + Math.pow(dY,2) + Math.pow(dZ,2));
		accumDist = accumDist+dist;
	}
	speed = (accumDist/time);
	return speed;
}

function getAmplitudeX(bufferTrial,id,jt){
	var ListX = getRaw(bufferTrial,id,jt,0);
	var DistX = (Math.max(...ListX) - Math.min(...ListX));
	return DistX;
}

function getAmplitudeY(bufferTrial,id,jt){
	var ListY = getRaw(bufferTrial,id,jt,1);
	var DistY = (Math.max(...ListY) - Math.min(...ListY));
	return DistY;
}

function getAmplitudeZ(bufferTrial,id,jt){
	var ListZ = getRaw(bufferTrial,id,jt,2);
	var DistZ = (Math.max(...ListZ) - Math.min(...ListZ));
	return DistZ;
}

function getOrientation(bufferTrial,id,jt){
    var RotX = getRaw(bufferTrial,id,jt,3);
		var maxRot = Math.max(...RotX), minRot = Math.min(...RotX);
		var lean = Math.abs(maxRot-minRot);
    return lean;
  }

function save2xlsx(bufferTrial, gtArray, exArray, filename){

	var wb = new Workbook(); //Create new wb object
  console.log(gtArray);
  console.log(exArray);
  console.log(bufferTrial);
	for (var i in gtArray){
	    var ws_name = "GT_"+(i).toString();
			var ws = sheet_from_bufferTrial(bufferTrial[gtArray[i]], ws_name);
			wb.SheetNames.push(ws_name);
			wb.Sheets[ws_name] = ws;
	  }
  for (var i in exArray){
      var ws_name = "EX_"+(i).toString();
      var ws = sheet_from_bufferTrial(bufferTrial[exArray[i]], ws_name);
      wb.SheetNames.push(ws_name);
      wb.Sheets[ws_name] = ws;
    }
	var wbout = XLSX.write(wb, {bookType:'xlsx', bookSST:false, type: 'binary'}); //Define workbook type
	XLSX.writeFile(wb, filename); //Write workbook
}
function Workbook() {
    if(!(this instanceof Workbook)) return new Workbook(); //Create new instance of workbook type
    this.SheetNames = [];
    this.Sheets = {};
}
function sheet_from_bufferTrial(bufferBodyFrames, ws_name) {
    var ws = {};
    var range = {s: {c:0, r:0}, e: {c:275, r:500 }};
		skeleton = 0; //Track which skeleton # it is out of the maximum 6
		for(var i = 0; i < bufferBodyFrames[0].bodies.length; i++){
			if(bufferBodyFrames[0].bodies[i].tracked){
				skeleton = i;
				break;
			}
		}

			for(var R = 0; R < bufferBodyFrames.length; R++){
				var column = 0; // Goes upto 275, i.e. 25 x 11
				for(var C = 0; C < bufferBodyFrames[R].bodies[skeleton].joints.length; C++) {
						for(var attributename in bufferBodyFrames[R].bodies[skeleton].joints[C]){
							var cell = {v: bufferBodyFrames[R].bodies[skeleton].joints[C][attributename]};
							if(cell.v == null) continue;
			        var cell_ref = XLSX.utils.encode_cell({c:column,r:R});
			        if(typeof cell.v === 'number') cell.t = 'n';
			        else if(typeof cell.v === 'boolean') cell.t = 'b';
			        else cell.t = 's';
			        ws[cell_ref] = cell;
							column++;
						}
		    }
			}
		ws['!ref'] = XLSX.utils.encode_range(range);
    return ws;
}

function chartAnalyze(bufferTrial,gtArray,exArray){
  var gtLabel = [], exLabel = [];
  for (var i in gtArray){
    gtLabel.push("GT_"+(i).toString());
  }
  for (var i in exArray){
    exLabel.push("EX_"+(i).toString());
  }

  var chartData = [
    {"Name": "Duration (seconds)",},
    {"Name": "Type",},
		{"Name": "Left Wrist Speed (m/s)"},
		{"Name": "Left Wrist Height Change (m)"},
		{"Name": "Right Wrist Speed (m/s)"},
		{"Name": "Right Wrist Height Change (m)"},
		{"Name": "Pelvic Speed (m/s)"},
		{"Name": "Pelvic Height Change (m)"},
		{"Name": "Trunk Leaning (degrees)"},
		{"Name": "Hip A-P Movement (m)"},
  ];
  // Duration
  for (var i in gtArray){
    chartData[0][ gtLabel[i] ] = bufferTrial[gtArray[i]].duration;
		chartData[1][ gtLabel[i] ] = typeofTest(bufferTrial,gtArray[i]);
		chartData[2][ gtLabel[i] ] = getSpeed(bufferTrial,gtArray[i],6).toFixed(2);
		chartData[3][ gtLabel[i] ] = getAmplitudeY(bufferTrial,gtArray[i],6).toFixed(2);
		chartData[4][ gtLabel[i] ] = getSpeed(bufferTrial,gtArray[i],10).toFixed(2);
		chartData[5][ gtLabel[i] ] = getAmplitudeY(bufferTrial,gtArray[i],10).toFixed(2);
		chartData[6][ gtLabel[i] ] = getSpeed(bufferTrial,gtArray[i],0).toFixed(2);
		chartData[7][ gtLabel[i] ] = getAmplitudeY(bufferTrial,gtArray[i],0).toFixed(2);
		chartData[8][ gtLabel[i] ] = getOrientation(bufferTrial,gtArray[i],1).toFixed(2);
		chartData[9][ gtLabel[i] ] = getAmplitudeZ(bufferTrial,gtArray[i],0).toFixed(2);
  }
  for (var i in exArray){
    chartData[0][ exLabel[i] ] = bufferTrial[exArray[i]].duration;
		chartData[1][ exLabel[i] ] = typeofTest(bufferTrial,exArray[i]);
		chartData[2][ exLabel[i] ] = getSpeed(bufferTrial,exArray[i],6).toFixed(2);
		chartData[3][ exLabel[i] ] = getAmplitudeY(bufferTrial,exArray[i],6).toFixed(2);
		chartData[4][ exLabel[i] ] = getSpeed(bufferTrial,exArray[i],10).toFixed(2);
		chartData[5][ exLabel[i] ] = getAmplitudeY(bufferTrial,exArray[i],10).toFixed(2);
		chartData[6][ exLabel[i] ] = getSpeed(bufferTrial,exArray[i],0).toFixed(2);
		chartData[7][ exLabel[i] ] = getAmplitudeY(bufferTrial,exArray[i],0).toFixed(2);
		chartData[8][ exLabel[i] ] = getOrientation(bufferTrial,exArray[i],1).toFixed(2);
		chartData[9][ exLabel[i] ] = getAmplitudeZ(bufferTrial,exArray[i],0).toFixed(2);
  }
  return chartData;
}

function curveAnalyze(bufferTrial,gtArray,exArray,gtInd,exInd,jt,datatype){
	var curveData ={};
	var maxlength = 0;
	curveData["numDataSets"] = gtInd.length + exInd.length;
	curveData["labels"] = [];
	curveData["dataset"] = [];
	curveData["xticks"] = [];
	if (gtInd.length>0){
		for(var i=0 ; i<gtInd.length; i++){
			curveData.labels.push("Referece_"+gtInd[i].toString() );
			var id = gtArray[gtInd[i]];
			var rawdata = getRaw(bufferTrial,id,jt,datatype);
			curveData.dataset.push( rawdata );
			if (rawdata.length>maxlength) {maxlength = rawdata.length}
		}
	}

	if (exInd.length>0){
		for(var i=0 ; i<exInd.length; i++){
			curveData.labels.push("Exercise_"+exInd[i].toString() );
			var id = exArray[exInd[i]];
			var rawdata = getRaw(bufferTrial,id,jt,datatype);
			curveData.dataset.push( rawdata );
			if (rawdata.length>maxlength) {maxlength = rawdata.length}
		}
	}
	var numMarks = 10;
	var pads = Math.ceil(maxlength/numMarks);

	for (var i = 0; i<numMarks; i++){
		var timeMark = (i*pads*0.008342).toFixed(2);
		curveData.xticks.push(timeMark.toString());
		for (var j = 1; j<pads; j++){
			curveData.xticks.push("");
		}
	}
	//	"xticks": ["1", "", "", "", "", "6", "", "", "", "", "11"],

	return curveData;
}

function barAnalyze(bufferTrial, gtArray, exArray){
	var barData = {};
	barData.leftHandSpeed = [];
	barData.leftHandHeightChange = [];
	barData.rightHandSpeed = [];
	barData.rightHandHeightChange = [];
	barData.pelvicSpeed = [];
	barData.pelvicHeightChange = [];
  barData.SpineMidOrientation = [];
	barData.SpineBaseMovement = [];
	var threshold = {
		Speed: 0.005,
		HeightChange: 0.005,
		Orientation: 1
	};
	var speed_jt6_gt = 0, height_jt6_gt = 0,speed_jt10_gt = 0, height_jt10_gt = 0,
			speed_jt0_gt = 0, height_jt0_gt = 0;
	var lean_jt1_gt = 0, ampZ_jt0_gt=0;
	for (var i in gtArray){
		speed_jt6_gt = getSpeed(bufferTrial,gtArray[i],6);
		height_jt6_gt += getAmplitudeY(bufferTrial,gtArray[i],6);
		speed_jt10_gt += getSpeed(bufferTrial,gtArray[i],10);
		height_jt10_gt += getAmplitudeY(bufferTrial,gtArray[i],10);
		speed_jt0_gt += getSpeed(bufferTrial,gtArray[i],0);
		height_jt0_gt += getAmplitudeY(bufferTrial,gtArray[i],0);
		lean_jt1_gt += getOrientation(bufferTrial,gtArray[i],1);
		ampZ_jt0_gt += getAmplitudeZ(bufferTrial,gtArray[i],0);
	}
	speed_jt6_gt/=gtArray.length;
	height_jt6_gt/=gtArray.length;
	speed_jt10_gt/=gtArray.length;
	height_jt10_gt/=gtArray.length;
	speed_jt0_gt/=gtArray.length;
	height_jt0_gt/=gtArray.length;
	lean_jt1_gt /=gtArray.length;
	ampZ_jt0_gt/=gtArray.length;

	for (var i in exArray){
		var speed_jt6_ex = getSpeed(bufferTrial,exArray[i],6);
		if (Math.abs(speed_jt6_gt) < threshold.Speed) { barData.leftHandSpeed.push(0);}
		else { barData.leftHandSpeed.push( (speed_jt6_ex-speed_jt6_gt)/speed_jt6_gt*100);}

		var height_jt6_ex = getAmplitudeY(bufferTrial,exArray[i],6);
		if (Math.abs(height_jt6_gt) < threshold.HeightChange) {barData.leftHandHeightChange.push(0);}
		else {barData.leftHandHeightChange.push( (height_jt6_ex-height_jt6_gt)/height_jt6_gt*100 );}

		var speed_jt10_ex = getSpeed(bufferTrial,exArray[i],10);
		if (Math.abs(speed_jt10_gt) < threshold.Speed) { barData.rightHandSpeed.push(0);}
		else {barData.rightHandSpeed.push( (speed_jt10_ex-speed_jt10_gt)/speed_jt10_gt*100);}

		var height_jt10_ex = getAmplitudeY(bufferTrial,exArray[i],10);
		if (Math.abs(height_jt10_gt) < threshold.HeightChange) {barData.rightHandHeightChange.push(0);}
		else {barData.rightHandHeightChange.push( (height_jt10_ex-height_jt10_gt)/height_jt10_gt*100 );}

		var speed_jt0_ex = getSpeed(bufferTrial,exArray[i],0);
		if (Math.abs(speed_jt0_gt) < threshold.Speed) { barData.pelvicSpeed.push(0);}
		else {barData.pelvicSpeed.push( (speed_jt0_ex-speed_jt0_gt)/speed_jt0_gt*100);}

		var height_jt0_ex = getAmplitudeY(bufferTrial,exArray[i],0);
		if (Math.abs(height_jt0_gt) < threshold.HeightChange) {barData.pelvicHeightChange.push(0);}
		else {barData.pelvicHeightChange.push( (height_jt0_ex-height_jt0_gt)/height_jt0_gt*100 );}

		var lean_jt1_ex = getOrientation(bufferTrial,exArray[i],1);
		if (Math.abs(lean_jt1_ex) < threshold.HeightChange) {barData.SpineMidOrientation.push(0);}
		else {barData.SpineMidOrientation.push( (lean_jt1_ex-lean_jt1_gt)/lean_jt1_gt*100 );}

		var ampZ_jt0_ex = getAmplitudeZ(bufferTrial,exArray[i],0);
		if (Math.abs(ampZ_jt0_gt) < threshold.HeightChange) {barData.SpineBaseMovement.push(0);}
		else {barData.SpineBaseMovement.push( (ampZ_jt0_ex-ampZ_jt0_gt)/ampZ_jt0_gt*100 );}

	}
	return barData;
}
/* Reference
Look-up for joint selection
Kinect2.JointType = {
 spineBase       : 0,
 spineMid        : 1,
 neck            : 2,
 head            : 3,
 shoulderLeft    : 4,
 elbowLeft       : 5,
 wristLeft       : 6,
 handLeft        : 7,
 shoulderRight   : 8,
 elbowRight      : 9,
 wristRight      : 10,
 handRight       : 11,
 hipLeft         : 12,
 kneeLeft        : 13,
 ankleLeft       : 14,
 footLeft        : 15,
 hipRight        : 16,
 kneeRight       : 17,
 ankleRight      : 18,
 footRight       : 19,
 spineShoulder   : 20,
 handTipLeft     : 21,
 thumbLeft       : 22,
 handTipRight    : 23,
 thumbRight      : 24
};


Structure of bodyFrame
bodyFrame = {
bodies:[
0:
	bodyIndex: 0
	joints: Array(25) [{depthX, depthY... orientationZ},{depthX, depthY... orientationZ} ]
	leftHandState: 0
	rightHandState: 0
	tracked: true
	trackingID: "7200399405055"
1:
	bodyIndex: 1
	tracked: false
...
]
floorClipPlane: {
	w:
	x:
	y:
	z:
}
*/
