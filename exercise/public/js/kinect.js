var socket = io.connect('/');
var clientActive = false;

$(document).ready(function () {
    var canvasSKLT = document.getElementById('bodyCanvas');
    var ctx1 = canvasSKLT.getContext('2d');

    document.getElementById("display").style.display = 'none';

    // Globals:
    var radius = 9;
    var width = canvasSKLT.width;
    var height = canvasSKLT.height;
    var IntervalID;
    var threshold_flag;
    var reps = 0;
    var neck_y;
    var neck_x;

    // Use bodyFrame from server to update the canvas 1 on client
    socket.on('init', function (bodyFrame, systemState) {
        clientActive = true;
        updateCanvas(bodyFrame, -1);
        document.getElementById("command").value = 'Start';
        document.getElementById("command").style.backgroundColor = '';
        document.getElementById("display").style.display = 'none';
    });

    socket.on('rec', function (bodyFrame, systemState, tracingID) {
        clientActive = true;

        // Initializing flag for counting repetitions

        if (!threshold_flag){

            // Based on exercise (eg squat), know which direction we start counting reps in
            threshold_flag = getExerciseInfo(document.getElementById("exercise").value)['direction'];
        }
        temp_reps = updateCanvas(bodyFrame, tracingID, 'rec', threshold_flag);
        if (temp_reps){
            threshold_flag = temp_reps[1];
            document.getElementById("reps").innerHTML = parseInt(document.getElementById("reps").innerHTML) + temp_reps[0];
        }
        document.getElementById("command").value = 'Stop';
        document.getElementById("command").style.backgroundColor = 'red';
        document.getElementById("display").style.display = 'none';
    });

    socket.on('disp', function (bufferBodyFrames, systemState, tracingID, activityLabeled) {
        clientActive = true; // unlock the button
        reps = 0;
        IntervalID = animateCanvas1(bufferBodyFrames, tracingID, 'disp');
        document.getElementById("command").value = 'Live';
        document.getElementById("command").style.backgroundColor = '';
        if (!activityLabeled)
            document.getElementById("display").style.display = 'block';
    });

    socket.on('live', function (bodyFrame) {
        clientActive = true;
        clearInterval(IntervalID);
        updateCanvas(bodyFrame, -1);

        document.getElementById("command").value = 'Start';
        document.getElementById("command").style.backgroundColor = '';
        document.getElementById("display").style.display = 'none';
    });

    socket.on('serverDataLabeled', function () { // hide the buttons "Reference","Exercise","Discard"
        document.getElementById("display").style.display = 'none';
    });

    socket.on('showing-speed', function (speed) {
        var gt_speed = 0.3; // temp for testing
        var ex_speed = Math.round(speed * 100) / 100;
        var msg = 'The reference speed is ' + gt_speed.toString() + ' m/s. Your speed is ' + ex_speed.toString() + ' m/s.';

        if ((gt_speed + 0.1) < ex_speed){
            msg = 'Try slowing down. ' + msg;
        }
        else if ((gt_speed - 0.1) > ex_speed){
            msg = 'Try increasing your speed. ' + msg;
        }
       document.getElementById("speed").innerHTML = msg;
    });


    function drawBody(body) {
        jointType = [7, 6, 5, 4, 2, 8, 9, 10, 11, 10, 9, 8, 2, 3, 2, 1, 0, 12, 13, 14, 15, 14, 13, 12, 0, 16, 17, 18, 19] //re visit and draw in a line
        jointType.forEach(function (jointType) {
            drawJoints(body.joints[jointType].depthX * width, body.joints[jointType].depthY * height);
        });
        

        drawCenterCircle(width / 2, height / 5, 50, body.joints[2].depthX * width, body.joints[2].depthY * height, body.joints[2].cameraZ, body.joints[19].depthY, body.joints[0].depthY);

        ctx1.beginPath();
        ctx1.moveTo(body.joints[7].depthX * width, body.joints[7].depthY * height);
        jointType.forEach(function (jointType) {
            ctx1.lineTo(body.joints[jointType].depthX * width, body.joints[jointType].depthY * height);
            ctx1.moveTo(body.joints[jointType].depthX * width, body.joints[jointType].depthY * height);
        });
        ctx1.lineWidth = 10;
        ctx1.strokeStyle = 'blue';
        ctx1.stroke();
        ctx1.closePath();
    }

    function drawJoints(cx, cy) {
        ctx1.beginPath();
        ctx1.arc(cx, cy, radius, 0, Math.PI * 2); //radius is a global variable defined at the beginning
        ctx1.closePath();
        ctx1.fillStyle = "yellow";
        ctx1.fill();
    }

    // Draw center circle - to help user position themselves
    function drawCenterCircle(x, y, r, nx, ny,nz, footright, spinebase) {
        ctx1.beginPath();
        if (nx > x - r && nx < x + r && ny > y - r && ny < y + r) {
            ctx1.strokeStyle = "green";
            if (!neck_y || !neck_x){
                neck_x = nx/width;
                neck_y = ny/height;
                console.log('neck_y', neck_y)
                console.log('footright', footright)
                console.log('spinebase', spinebase)
            }
        } else {
            ctx1.strokeStyle = "red";
        }

        ctx1.arc(x, y, r, 0, Math.PI * 2);
        ctx1.stroke();
        ctx1.closePath();
        ctx1.strokeStyle = "black";
    }

    // Function parameters: range_scale is how much to scale the distance between spine and foot,
    // top_thresh and bottom_thresh are the thresholds the user should reach when the signal 
    // has been scaled to a range between 0 and 1, for a repetition to count

    function countReps(body, threshold_flag, range_scale=0.7, top_thresh=0.25, bottom_thresh=0.75){
        var reps = 0;
        var norm;

        // Get info based on exercise (default is squat)
        // This should eventually be a db call
        var exInfo = getExerciseInfo(document.getElementById("exercise").value);
        var joint = exInfo['joint'];
        var coordinate = exInfo['axis'];
        
        // This is set when user is correctly positioned in circle
        if (coordinate == 'depthY') {
            norm = neck_y;
        } else if (coordinate == 'depthX') {
            norm = neck_x;
        }

        // Normalize reference points to neck
        var ref_norm = exInfo['ref_neck'];
        var ref_max = exInfo['ref_max'] - ref_norm;
        var ref_min = exInfo['ref_min'] - ref_norm;

        // Range is based on distance between foot and spine 
        var ref_foot = exInfo['ref_foot'];
        var ref_spine = exInfo['ref_spine'];
        var range = (ref_foot - ref_norm - ref_spine)*range_scale;

        // Normalize current point by range and current neck value
        var current_pt = (body.joints[joint][coordinate] - norm - ref_max)/range;
        
        if ((threshold_flag == 'down') && (current_pt < top_thresh)){
            reps++;
            return [reps,'up'];
        } else if ((threshold_flag == 'up') && (current_pt > bottom_thresh)){
            return [reps,'down'];
        } else {
            return [reps, threshold_flag]
        }
    }

    // Line to indicate user reaching some standard or requirement
    // Input is start of line, ground truth height, exercise height
    // Line is yellow if requirement unfulfilled, green if fulfilled
    function draw_height_line(starting_x, gt_y, ex_y, comparison='less', direction='right') {
        ctx1.beginPath();
        if (comparison == 'less') {
            if (ex_y < gt_y) {
                ctx1.strokeStyle = "green";
            } else {
                ctx1.strokeStyle = "yellow";
            }
        }
        else {
            if (ex_y > gt_y) {
                ctx1.strokeStyle = "green";
            } else {
                ctx1.strokeStyle = "yellow";
            }
        }

        ctx1.moveTo(starting_x, gt_y);
        if (direction == 'both') {
            ctx1.lineTo(width, gt_y);
            ctx1.lineTo(0, gt_y);
        } else if (direction == 'left') {
            ctx1.lineTo(0, gt_y);
        } else {
            ctx1.lineTo(width, gt_y);
        }
        ctx1.stroke();
        ctx1.closePath();
        ctx1.strokeStyle = "black";
    }


    // Draw every new bodyframe on the canvas
    function updateCanvas(bodyFrame, tracingID, mode='', threshold_flag='') {
        ctx1.clearRect(0, 0, width, height);
        var reps = 0;
        if (tracingID == -1) {
            bodyFrame.bodies.some(function (body) {
                if (body.tracked) {
                    drawBody(body);
                    if (mode=='rec'){
                        reps = countReps(body, threshold_flag);
                    }
                }
            });
        } else {
            var body = bodyFrame.bodies[tracingID];
            drawBody(body);
            reps = countReps(body, threshold_flag);
        }
        return reps;
    }

    function animateCanvas1(bufferBodyFrames, tracingID){
        var i = 0;
        var TimerID = setInterval(function(){
          updateCanvas(bufferBodyFrames[i], tracingID);
          i++;
          if (i>=bufferBodyFrames.length){i=0;}
        },20);
        return TimerID;
      }


    // Get info from JSON about a given exercise 
    function getExerciseInfo(exercise){
        // This info should be patient-specific and eventually stored in the db
        exercise_info = {
            'hand_raise': 
                {'joint': 11, 
                'direction': 'down', 
                'axis': 'depthY',
                'ref_max': 0.73,
                'ref_min': 1.19,
                'ref_mean': 0.76,
                'ref_neck': 0.27,
                },
            'squat':
                {'joint': 0, 
                'direction': 'up', 
                'axis': 'depthY',
                'ref_max': 0.68,
                'ref_min': 1.13,
                'ref_mean': 0.76,
                'ref_neck': 0.27,
                'ref_foot': 1.43,
                'ref_spine': 0.70
                },            
        }
        return exercise_info[exercise];
    }
});