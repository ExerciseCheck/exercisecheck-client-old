$(document).ready(function () {
  //state button
  $("#command").click(function () {
    if (clientActive){
      socket.emit('command');
      clientActive = false; // lock the client until server responds
    }
  });

  $("#gt").click(function () {
    socket.emit('dataLabelFromClient', 1);
  });

  $("#ex").click(function () {
    socket.emit('dataLabelFromClient', 2);
  });

  $("#re").click(function () {
    socket.emit('dataLabelFromClient', 3);
  });

  document.getElementById("lsq_threshold").onchange = function(){
    var select_threshold = document.getElementById("lsq_threshold");
    var selected_value = select_threshold.options[select_threshold.selectedIndex].value;
    socket.emit('setLsqThreshold', selected_value);
  };

  $("#report").click(function () {
    console.log('report button pressed!');
    location.href = "report.html";
    location.target = "_blank";
  });

  $("#save").click(function(){
    console.log("Request server to save data");
    socket.emit('save');
  });

});
//hide button
