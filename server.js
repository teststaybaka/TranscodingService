var spawn = require('child_process').spawn;

var worker = spawn('ffmpeg', []);
worker.stdout.on('data', function (data) {
  data = data.toString();
  console.log(data);
}
worker.on('data', function (data) {
  console.log('transcoding error:'+data.toString());
});
worker.on('close', function (code) {
  console.log('worker exited with code:'+code);
});
