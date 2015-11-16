var express = require("express");
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var app = express();
var fs = require('fs');
var spawn = require('child_process').spawn;
var gcloud = require('gcloud');
var multer = require('multer');

app.set('views', 'static');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);


app.get('/', function(req, res, next) {
    res.render('index.html');
});

var uploading = multer({
    dest: 'uploads',
    limits: {fileSize: 5000000000, files:1},
});

var storage = gcloud.storage({
    projectId: 'dan-tube'
});


var width = 640;
var height = 480;
var args = ['-i', '1.mp4', '-y', '-c:a', 'libfdk_aac', '-b:a', '320k', '-filter:v', 'scale=iw*min('+width+'/iw\\, '+height+'/ih):ih*min('+width+'/iw\\, '+height+'/ih), pad='+width+':'+height+':('+width+'-iw*min('+width+'/iw\\, '+height+'/ih))/2:('+height+'-ih*min('+width+'/iw\\, '+height+'/ih))/2', '-c:v', 'libx264', '-b:v', '800k', '-maxrate', '1200k', '-bufsize', '2000k', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p', '-r:v', '24', '-movflags', 'faststart', 'test.mp4'];


var bucket = storage.bucket('dantube-videos');

app.post('/', uploading.any(), function(req, res ){
    console.log(req.files);
    var filename = req.files[0].filename+".mp4";
    var localpath = 'videos/'+filename;
    args[1] = req.files[0].path;
    args[27] = localpath;
    var worker = spawn('ffmpeg', args);
    worker.stdout.on('data', function (data) {
        console.log(data.toString());
    });
    worker.stderr.on('data', function (data) {
        console.log(data.toString());
    });
    worker.on('close', function (code) {
        console.log('ffmpeg worker exited with code:'+code);
        bucket.upload(localpath, {destination: filename}, function(err) {
            if (err) {
                console.log('video upload error:'+JSON.stringify(err));
            } else {
                console.log('video uploaded successfully');
                fs.unlink(localpath);
                fs.unlink(req.files[0].path);
            }
        });
    });
    res.redirect("/");
});

app.listen(3000);

console.log("Server running");