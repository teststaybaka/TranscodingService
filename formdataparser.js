var fs = require('fs');
var Buffer = require('buffer').Buffer;
var EventEmitter = require('events').EventEmitter;

function string2array(str) {
    var s = [];
    for (var i = 0; i < str.length; i++) {
        s.push(str.charCodeAt(i));
    }
    return s;
}

function buffer2string(buffer) {
    return buffer.toString('utf8');
}

function FormdataParser(request, boundary_str, post_max, post_multipart_max) {
    var self = this;
    var start_boundary = string2array(boundary_str);
    var content_boundary = string2array('\n'+boundary_str);
    var space = ' '.charCodeAt(0);
    var quote = '"'.charCodeAt(0);
    var semicolon =';'.charCodeAt(0);
    var newline = '\n'.charCodeAt(0);
    var dash = '-'.charCodeAt(0);
    var content_disposition_prefix = string2array('Content-Disposition: form-data');
    var name_prefix = string2array('name="');
    var filename_prefix = string2array('filename="');
    var content_type_prefix = string2array('Content-Type:');
    var data = {};
    var cur_name;
    var cur_filename;
    var cur_content_type;
    var cur_writestream;
    var cur_size_accumulator = 0;
    var cur_chunk, tmp_chunk = null, pre_chunk = null;
    var start_index, end_index;
    var isFile;
    var in_progress = false;
    var total = 0;
    var pointer = 0;

    this.start_boundary_state = function(cur) {
        if (cur[1] === start_boundary[pointer]) {
            pointer += 1;
            if (pointer === start_boundary.length) {
                pointer = 0;
                cur_state = self.newline_state1;
            }
        } else {
            throw 'Form parse error: Expecting boundary as start';
        }
    }

    this.content_boundary_state = function(cur) {
        if (cur[1] === content_boundary[pointer]) {
            pointer += 1;
            if (pointer === content_boundary.length) {
                pointer = 0;
                in_progress = false;
                if (!isFile) {
                    if (pre_chunk.length + end_index - start_index + 1 > post_max) {
                        throw 'Exceed non-file size limit';
                    } else {
                        data[cur_name] = buffer2string(Buffer.concat([pre_chunk, cur_chunk.slice(start_index, end_index+1)], pre_chunk.length + end_index - start_index + 1));
                    }
                } else {
                    cur_writestream.end(cur_chunk.slice(start_index, end_index+1));
                }
                cur_state = self.newline_state1;
            }
        } else {
            pointer = 0;
            end_index = cur[0];
        }
    }

    this.newline_state1 = function(cur) {
        if (cur[1] === newline) {
            cur_state = self.disposition_state;
        } else if (cur[1] === dash) {
            pointer += 1;
            if (pointer === 2) {
                pointer = 0;
                cur_state = self.end_state;
            }
        } else{
            throw 'Form parse error: Expecting newline after boundary or double dashes to end';
        }
    }

    this.disposition_state = function(cur) {
        if (cur[1] === content_disposition_prefix[pointer]) {
            pointer += 1;
            if (pointer === content_disposition_prefix.length) {
                pointer = 0;
                cur_state = self.skip_state1;
            }
        } else {
            throw 'Form prase error: Exepcting Content-Disposition';
        }
    }

    this.skip_state1 = function(cur) {
        if (cur[1] === semicolon || cur[1] === space){
            //do nothing
        } else if (cur[1] !== newline) {
            cur_state = self.name_state;
            cur_state(cur);
        } else {
            throw 'Form parse error: Newline in skip state 1';
        }
    }

    this.name_state = function(cur) {
        if (cur[1] === name_prefix[pointer]) {
            pointer += 1;
            if (pointer === name_prefix.length) {
                pointer = 0;
                start_index = cur[0]+1;
                cur_state = self.extract_name_state;
            }
        } else {
            throw 'Form parse error: Expecting key to be "name"';
        }
    }

    this.extract_name_state = function(cur) {
        if (cur[1] !== quote) {
            end_index = cur[0];
        } else {
            cur_name = buffer2string(cur_chunk.slice(start_index, end_index+1));
            cur_state = self.skip_state2;
        }
    }

    this.skip_state2 = function(cur) {
        if (cur[1] === semicolon || cur[1] === space){
            //do nothing
        } else if (cur[1] !== newline) {
            isFile = true;
            cur_state = self.filename_state;
            cur_state(cur);
        } else {
            isFile = false;
            cur_state = self.newline_state2;
        }
    }

    this.filename_state = function(cur) {
        if (cur[1] === filename_prefix[pointer]) {
            pointer += 1;
            if (pointer === filename_prefix.length) {
                pointer = 0;
                start_index = cur[0]+1;
                cur_state = self.extract_filename_state;
            }
        } else {
            throw 'Form parse error: Expecting key to be "filename"'
        }
    }

    this.extract_filename_state = function(cur) {
        if (cur[1] !== newline) {
            end_index = cur[0];
        } else {
            cur_filename = buffer2string(cur_chunk.slice(start_index, end_index));
            cur_state = self.content_type_state;
        }
    }

    this.content_type_state = function(cur) {
        if (cur[1] === content_type_prefix[pointer]) {
            pointer += 1;
            if (pointer === content_type_prefix.length) {
                pointer = 0;
                cur_state = self.skip_state3;
            }
        } else {
            throw 'Form parse error: Expecting "Content-Type"';
        }
    }

    this.skip_state3 = function(cur) {
        if (cur[1] === space) {
            //do nothing
        } else {
            start_index = cur[0]+1;
            cur_state = self.extract_content_type_state;
            cur_state(cur);
        }
    }

    this.extract_content_type_state = function(cur) {
        if (cur[1] !== newline) {
            end_index = cur[0];
        } else {
            cur_content_type = buffer2string(cur_chunk.slice(start_index, end_index+1));
            cur_state = self.newline_state2;
        }
    }

    this.newline_state2 = function(cur) {
        if (cur[1] === newline) {
            in_progress = true;
            start_index = cur[0]+1;
            end_index = cur[0];
            if (isFile) {
                var tmp_filepath = './tmp/tmpfile'+Date.now();
                cur_writestream = fs.createWriteStream(tmp_filepath, {defaultEncoding: 'binary'});
                data[cur_name] = {
                    filename: cur_filename,
                    content_type: cur_content_type,
                    tmp_filepath: tmp_filepath,
                }
            }
            cur_state = self.content_boundary_state;
        } else {
            throw 'Form parse error: Expecting last newline before actuall content but got '+cur[1];
        }
    }

    this.end_state = function() {
        throw 'Form parse error: Already met end marker.';
    }

    this._parse = function(chunk) {
        total += chunk.length;
        console.log(total);
        // console.log(chunk.toString('ascii'));
        if (total > post_multipart_max) {
            throw 'Exceed size limit.'
        }

        if (tmp_chunk && tmp_chunk.length !== 0) {
            cur_chunk = Buffer.concat([tmp_chunk, chunk], tmp_chunk.length + chunk.length);
        } else {
            cur_chunk = chunk;
        }

        var iter = cur_chunk.values();
        do {
            var cur = iter.next();
            cur_state(cur.value);
            total += 1;
        } while (!cur.done);

        if (in_progress) {
            if (!isFile) {
                if (pre_chunk) {
                    pre_chunk = Buffer.concat([pre_chunk, cur_chunk.slice(start_index, end_index+1)], pre_chunk.length + end_index - start_index + 1);
                } else {
                    pre_chunk = cur_chunk.slice(start_index, end_index+1);
                }
                request.resume();
            } else {
                cur_writestream.write(cur_chunk.slice(start_index, end_index+1), function() {
                    request.resume();
                });
            }
            tmp_chunk = cur_chunk.slice(end_index+1);
            start_index = 0;
            end_index = -1;
            pointer = 0;
        } else {
            tmp_chunk = null;
            pre_chunk = null;
            request.resume();
        }
    }

    this.parse = function() {
        request.on('data', function(chunk)) {
            request.pause();
            self.parse(chunk);
        });

        request.on('end', function() {
            self.emit('finished');
        });
    }

    var cur_state = this.start_boundary_state;
}
FormdataParser.prototype = new EventEmitter;

module.exports = FormdataParser;