var spawn = require('child_process').spawn;

var width = 640;
var height = 480;
//var worker = spawn('ls', ['-lh']);
//var worker = spawn('ffmpeg', ['-i', '1.mp4', 'test.mp4']);
var args = ['-i', '1.mp4', '-y', '-c:a', 'libfdk_aac', '-b:a', '320k', '-filter:v', 'scale=iw*min('+width+'/iw\\, '+height+'/ih):ih*min('+width+'/iw\\, '+height+'/ih), pad='+width+':'+height+':('+width+'-iw*min('+width+'/iw\\, '+height+'/ih))/2:('+height+'-ih*min('+width+'/iw\\, '+height+'/ih))/2', '-c:v', 'libx264', '-b:v', '900k', '-maxrate', '1200k', '-bufsize', '2000k', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p', '-movflags', 'faststart','-r:v', '24', 'test.mp4'];
console.log(args);
var worker = spawn('ffmpeg', args);
worker.stdout.on('data', function (data) {
    console.log(data.toString());
});
worker.stderr.on('data', function (data) {
    console.log(data.toString());
});
worker.on('close', function (code) {
    console.log('worker exited with code:'+code);
});
