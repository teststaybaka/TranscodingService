var gcloud = require('gcloud');
var spawn = require('child_process').spawn;
var Router = require('./router.js');

var router = new Router();
router.setStatic('/static', './static');
router.setTemplateDir('./static');
router.listen(80);

router.get(/^\/$/, function(request, response) {
    router.render(response, 'index.html');
});

router.get(/^\/test$/, function(request, response) {
    router.render(response, 'test.html');
});

router.post(/^\/upload$/, function(request, response) {
    console.log(request.content_type);
    console.log(request.body);
    router.redirect(response, '/');
});