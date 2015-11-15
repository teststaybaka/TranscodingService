var express = require('express');
var router = express.Router();
var multer = require('multer');
var ffmpeg = require('fluent-ffmpeg');
var fs = require('fs');
var gcloud = require('gcloud');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});


var uploading = multer({
    dest: __dirname + '/../public/uploads/',
    limits: {fileSize: 5000000000, files:1},
});

var storage = gcloud.storage({
    projectId: 'dan-tube'
});

var bucket = storage.bucket('dantube-videos');

router.post('/', uploading.any(), function(req, res ){
    console.log(req.files);
    console.log(req.files[0].path);
    var filename = req.files[0].filename+".mp4";
    var localpath = __dirname+'/../videos/'+filename;
    ffmpeg(req.files[0].path)
        .videoCodec('libx264')
        .audioCodec('libmp3lame')
        .size('320x240')
        .on('error', function(err) {
            console.log('An error occurred: ' + err.message);
        })
        .on('end', function() {
            console.log('Processing finished!');
            bucket.upload(localpath, {destination: filename}, function(err, file) {
                if (err) {
                    console.log('video upload error:'+JSON.stringify(err));
                } else {
                    console.log('video uploaded successfully');
                    fs.unlink(localpath);
                    fs.unlink(req.files[0].path);
                }
            });
        })
        .save(localpath);
    res.redirect("/");
});

module.exports = router;
