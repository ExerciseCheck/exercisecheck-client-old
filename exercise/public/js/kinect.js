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

    // Use bodyFrame from server to update the canvas 1 on client
    socket.on('init', function (bodyFrame, systemState) {
        clientActive = true;
        liveupdateCanvas1(bodyFrame, -1);
        document.getElementById("command").value = 'Start';
        document.getElementById("command").style.backgroundColor = '';
        document.getElementById("display").style.display = 'none';
    });

    socket.on('rec', function (bodyFrame, systemState, tracingID) {
        clientActive = true;
        liveupdateCanvas1(bodyFrame, tracingID);
        document.getElementById("command").value = 'Stop';
        document.getElementById("command").style.backgroundColor = 'red';
        document.getElementById("display").style.display = 'none';
    });

    socket.on('disp', function (bufferBodyFrames, systemState, tracingID, activityLabeled) {
        clientActive = true; // unlock the button
        IntervalID = animateCanvas1(bufferBodyFrames, tracingID, 'disp');
        document.getElementById("command").value = 'Live';
        document.getElementById("command").style.backgroundColor = '';
        if (!activityLabeled)
            document.getElementById("display").style.display = 'block';
    });

    socket.on('live', function (bodyFrame) {
        clientActive = true;
        clearInterval(IntervalID);
        liveupdateCanvas1(bodyFrame, -1);

        document.getElementById("command").value = 'Start';
        document.getElementById("command").style.backgroundColor = '';
        document.getElementById("display").style.display = 'none';
    });

    socket.on('serverDataLabeled', function () { // hide the buttons "Reference","Exercise","Discard"
        document.getElementById("display").style.display = 'none';
    });

    socket.on('showing-speed', function (speed) {
        document.getElementById("speed").innerHTML = (Math.round(speed * 100) / 100).toString() + " m/s";

    });


    function drawBody(body) {
        jointType = [7, 6, 5, 4, 2, 8, 9, 10, 11, 10, 9, 8, 2, 3, 2, 1, 0, 12, 13, 14, 15, 14, 13, 12, 0, 16, 17, 18, 19] //re visit and draw in a line
        jointType.forEach(function (jointType) {
            drawJoints(body.joints[jointType].depthX * width, body.joints[jointType].depthY * height);
        });

        // Example of hand raising exercise.
        var line_marker = document.getElementById("line-marker").value;
        var gt_y_test;
        if (line_marker == 11) {
            gt_y_test = 250;
            draw_height_line(body.joints[8].depthX * width, gt_y_test, body.joints[line_marker].depthY * height);
        } else if (line_marker == 0) {
            gt_y_test = 500;
            draw_height_line(body.joints[13].depthX * width, gt_y_test, body.joints[line_marker].depthY * height, comparison = 'greater', direction = 'both');
        }

        drawCenterCircle(width / 2, height / 5, 50, body.joints[2].depthX * width, body.joints[2].depthY * height);

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
    function drawCenterCircle(x, y, r, nx, ny) {
        ctx1.beginPath();
        if (nx > x - r && nx < x + r && ny > y - r && ny < y + r)
            ctx1.strokeStyle = "green";
        else
            ctx1.strokeStyle = "red";

        ctx1.arc(x, y, r, 0, Math.PI * 2);
        ctx1.stroke();
        ctx1.closePath();
        ctx1.strokeStyle = "black";
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

    function liveupdateCanvas1(bodyFrame, tracingID) {
        ctx1.clearRect(0, 0, width, height);
        if (tracingID == -1) {
            bodyFrame.bodies.some(function (body) {
                if (body.tracked) {
                    drawBody(body);
                    return (body.tracked);
                }
            });
        } else {
            drawBody(bodyFrame.bodies[tracingID]);
        }
    }

    function animateCanvas1(bufferBodyFrames, tracingID, source='') {
        var i = 0;
        var TimerID = setInterval(function () {
            liveupdateCanvas1(bufferBodyFrames[i], tracingID);
            i++;
            if (i >= bufferBodyFrames.length) {
                i = 0;
            }
        }, 20);
        return TimerID;
    }
});


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
*/
