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

router.post(/^\/upload$/, function(request, response) {

});