var fs = require('fs');
var gcloud = require('gcloud');

var gcs = gcloud.storage({
    projectId: 'dan-tube'
});

var bucket = gcs.bucket('dantube-videos');
bucket.upload('./test.mp4', {destination: 'test.mp4'}, function(err, file) {
    if (err) {
        console.log('video upload error:'+JSON.stringify(err)); 
    } else {
        console.log('video uploaded successfully');
    }
});
