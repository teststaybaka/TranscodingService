var http = require('http');
var https = require('https');
var fs = require('fs');
var querystring = require('querystring');
var stream = require('stream');
var FormDataParser = require('./formdataparser.js');

Array.prototype.last = function(index) {
    return this[this.length - index];
}

function Router() {
    var self = this;
    var static_dirs = [];
    var rules = [];
    var templateDir = './';

    var post_max = 1e4;
    var post_multipart_max = 1e10;
    var key_value_reg = /^(.*?)=(.*)$/;
    var form_boundary_reg = /^.*boundary=(.*)$/;
    var suffix_reg = /\.(.*?)$/;
    var mimeTypes = {
        "html": "text/html",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "gif": 'image/gif',
        "js": "text/javascript",
        "css": "text/css"
    };

    this.dispatcher = function(request, response) {
        //parse url
        var url_parts = request.url.split('?');
        var pathname = url_parts[0];
        var params = {};
        if (url_parts.length === 2) {
            params = querystring.parse(url_parts[1], null, null, {maxKeys: 0});
        }
        console.log(pathname)
        console.log(params)

        //match static
        for (var i = 0; i < static_dirs.length; i++) {
            var exp = static_dirs[i].exp;
            var local_pre = static_dirs[i].local_pre;
            var match = pathname.match(exp);
            if (match) {
                var file_path = match.last(1);
                fs.readFile(local_pre+'/'+file_path, function (err, data) {
                    if (err) {
                        console.log(err);
                        self.notFound(response);
                    } else {
                        var suffix = file_path.match(suffix_reg);
                        if (suffix && (suffix[1] in mimeTypes)) {
                            var mimeType = mimeTypes[suffix[1]];
                            response.writeHead(200, {'Content-Type': mimeType});
                        } else {
                            response.writeHead(200, {'Content-Type': 'application/octet-stream'});
                        }
                        response.write(data);
                        response.end();
                    }
                });
                return;
            }
        }

        //match url rules
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            var match = pathname.match(rule.exp);
            if (match && request.method.toUpperCase() === rule.method) {
                if (rule.method === 'POST') {
                    var content_type_parts = request.headers['content-type'].split(';');
                    var content_type = content_type_parts[0];
                    console.log('start:');

                    if (content_type === 'multipart/form-data' && content_type_parts.length === 2 && form_boundary_reg.test(content_type_parts[1])) {
                        var boundary_str = '--'+content_type_parts[1].match(form_boundary_reg)[1];
                        var parser = new FormDataParser(request, boundary_str, post_max, post_multipart_max);
                        parser.on('finished', function() {
                            rule.callback(request, response, match);
                        });
                    } else if (content_type === 'application/x-www-form-urlencoded') {
                        var data_string = '';
                        request.setEncoding('utf8');
                        request.on('data', function(chunk) {
                            data_string += chunk;

                            if (data_string.length > post_max) {
                                self.notAllowed(response);
                            }
                        });

                        request.on('end', function() {
                            request.body = querystring.parse(data_string, null, null, {maxKeys: 0});
                            rule.callback(request, response, match);
                        });
                    } else {
                        var tmp_filepath = './tmp/tmpfile'+Date.now();
                        var writestream = fs.createWriteStream(tmp_filepath, {defaultEncoding: 'binary'});
                        request.pipe(writestream);
                        writestream.on('finish', function() {
                            fs.stat(tmp_filepath, function(error, stat) {
                                if (error) { throw error; }
                                request.body = {
                                    content_type: content_type,
                                    tmp_filepath: tmp_filepath
                                    content_length: stat.size,
                                }
                            }); 
                        });
                    }
                } else {
                    rule.callback(request, response, match);
                }
                return;
            }
        }

        self.notFound(response);
    }

    this.listen = function(port) {
        self.server.listen(port);
    }

    this.get = function(exp, callback) {
        rules.push({exp: exp, callback: callback, method: 'GET'});
    }

    this.post = function(exp, callback) {
        rules.push({exp: exp, callback: callback, method: 'POST'});
    }

    this.setPostMax = function(max_value) {
        post_max = max_value;
    }

    this.setPostMultipartMax = function(max_value) {
        post_multipart_max = max_value;
    }

    this.getCookie = function(request, name) {
        if (!request.cookies) {
            request.cookies = {}
            var cookie_parts = [];
            if (request.headers.cookie) {
                cookie_parts = request.headers.cookie.split(';');
            }
            for (var i = 0; i < cookie_parts.length; i++) {
                var cookie_str = cookie_parts[i];
                var index = cookie_str.indexOf('=');
                if (index !== -1) {
                    request.cookies[cookie_str.substring(0, index).trim()] = cookie_str.substring(index+1);
                }
            }
        }
        return request.cookies[name];
    }

    this.setCookie = function(response, name, value, path, max_age) {
        var cookie_str = name+'='+value;
        if (path) {
            cookie_str += '; path='+path;
        }
        if (max_age) {
            var now = Date.now();
            var expires = new Date(now*1000 + max_age);
            cookie_str += '; expires='+expires.toGMTString();
        }
        response.setHeader('Set-Cookie', cookie_str);
    }

    this.setStatic = function(url_pre, local_pre) {
        var exp = new RegExp('^'+url_pre+'/(.*)$');
        static_dirs.push({exp: exp, local_pre: local_pre});
    }

    this.redirect = function(response, url) {
        response.writeHead(302, {
            'Location': url,
        });
        response.end();
    }

    this.notFound = function(response) {
        response.writeHead(404, {'Content-Type': 'text/plain'});
        response.write('404 Not Found\n');
        response.end();
    }

    this.notAllowed = function(response) {
        response.writeHead(403, {'Content-Type': 'text/html'});
        response.end('done');
        request.connection.destroy();
    }

    this.setTemplateDir = function(dir) {
        templateDir = dir;
    }

    this.render = function(response, filename, params) {
        fs.readFile(templateDir+'/'+filename, function (err, data) {
            if (err) {
                console.log(err);
                self.notFound(response);
            } else {
                var suffix = filename.match(suffix_reg);
                if (suffix && (suffix[1] in mimeTypes)) {
                    var mimeType = mimeTypes[suffix[1]];
                    response.writeHead(200, {'Content-Type': mimeType});
                } else {
                    response.writeHead(200, {'Content-Type': 'application/octet-stream'});
                }
                response.write(data);
                response.end();
            }
        });
    }

    this.server = http.createServer(this.dispatcher);
};

module.exports = Router;