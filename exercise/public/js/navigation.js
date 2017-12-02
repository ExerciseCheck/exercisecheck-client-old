$(document).ready(function () {
  //state button
  $("#command").click(function () {
    if (clientActive){
      socket.emit('command',window.localStorage.getItem("token"));
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

  $("#sendGT").click(function () {
    // socket.emit('sendGT');
  });

  $("#report").click(function () {
    console.log('report button pressed!');
    location.href = "report.html";
    location.target = "_blank";
  });

});
//hide button
