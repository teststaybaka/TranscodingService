var fs = require('fs');
var Buffer = require('buffer').Buffer;

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

function array2string(bytes) {
    return new Buffer(bytes).toString('utf8');
}

function parseFormdata(request, boundary_str, post_max, post_multipart_max, success, fail) {
    var self = this;
    var start_boundary = string2array(boundary_str);
    var content_boundary = string2array('\r\n'+boundary_str);
    var content_boundary_buffer = new Buffer(content_boundary);
    var space = ' '.charCodeAt(0);
    var quote = '"'.charCodeAt(0);
    var semicolon =';'.charCodeAt(0);
    var returnline = '\r'.charCodeAt(0);
    var newline = '\n'.charCodeAt(0);
    var dash = '-'.charCodeAt(0);
    var content_disposition_prefix = string2array('Content-Disposition: form-data');
    var name_prefix = string2array('name="');
    var filename_prefix = string2array('filename="');
    var content_type_prefix = string2array('Content-Type:');
    var data = {};
    var buffer = [];
    var cur_name;
    var cur_filename;
    var cur_content_type;
    var cur_writestream;
    var cur_size_accumulator = 0;
    var cur_chunk, pre_chunk = null;
    var start_index, end_index;
    var isFile;
    var in_progress = false;
    var total = 0;
    var pointer = 0;

    this.start_boundary_state = function(idx, value) {
        // console.log(idx, value, pointer, start_boundary[pointer], boundary_str[pointer]);
        if (value === start_boundary[pointer]) {
            pointer += 1;
            if (pointer === start_boundary.length) {
                pointer = 0;
                cur_state = self.newline_state1;
            }
        } else {
            throw 'Form parse error: Expecting boundary as start';
        }
    }

    this.value_boundary_state = function(idx, value) {
        if (value === returnline || value === newline) {
            in_progress = false;
            if (pre_chunk) {
                if (pre_chunk.length + end_index - start_index + 1 > post_max) {
                    throw 'Exceed non-file size limit';
                } else {
                    data[cur_name] = buffer2string(Buffer.concat([pre_chunk, cur_chunk.slice(start_index, end_index + 1)], pre_chunk.length + end_index - start_index + 1));
                    pre_chunk = null;
                }
            } else {
                data[cur_name] = buffer2string(cur_chunk.slice(start_index, end_index + 1));
            }
            cur_state = self.pure_boundary_state;
            cur_state(idx, value);
        } else {
            end_index = idx;
        }
    }

    this.pure_boundary_state = function(idx, value) {
        if (value === content_boundary[pointer]) {
            pointer += 1;
            if (pointer === content_boundary.length) {
                pointer = 0;
                cur_state = self.end_state;
            }
        } else {
            throw 'Form parse error: Expecting boudnary string.'
        }
    }

    this.content_boundary_state = function(idx, value) {
        if (value === content_boundary[pointer]) {
            // console.log(idx, value, pointer, content_boundary[pointer], ('\r\n'+boundary_str)[pointer], end_index);
            pointer += 1;
            if (pointer === content_boundary.length) {
                pointer = 0;
                in_progress = false;
                if (start_index === end_index + 1) {
                    cur_writestream.end();
                } else {
                    if (start_index < 0) {
                        console.log('remain!!!!!!!!!')
                        cur_writestream.write(content_boundary_buffer.slice(0, - start_index));
                        cur_writestream.end(cur_chunk.slice(0, end_index+1));
                    } else {
                        cur_writestream.end(cur_chunk.slice(start_index, end_index+1));
                    }
                }
                data[cur_name].size = cur_size_accumulator + end_index - start_index + 1;
                if (data[cur_name].filename.length == 0) {
                    console.log(data[cur_name])
                    fs.unlink(data[cur_name].tmp_filepath);
                    delete data[cur_name];
                }
                cur_size_accumulator = 0;
                cur_state = self.newline_state1;
            }
        } else if (pointer !== 0 && value === content_boundary[0]) {
            pointer = 1;
            end_index = idx - 1;
            // console.log(idx, value, 0, content_boundary[0], ('\r\n'+boundary_str)[0], end_index);
        } else {
            pointer = 0;
            end_index = idx;
        }
    }

    this.newline_state1 = function(idx, value) {
        if (value === returnline) {
            // do nothing
        } else if (value === newline) {
            cur_state = self.disposition_state;
        } else if (value === dash) {
            pointer += 1;
            if (pointer === 2) {
                pointer = 0;
                cur_state = self.end_state;
            }
        } else{
            throw 'Form parse error: Expecting newline after boundary or double dashes to end';
        }
    }

    this.disposition_state = function(idx, value) {
        if (value === content_disposition_prefix[pointer]) {
            pointer += 1;
            if (pointer === content_disposition_prefix.length) {
                pointer = 0;
                cur_state = self.skip_state1;
            }
        } else {
            throw 'Form prase error: Exepcting Content-Disposition';
        }
    }

    this.skip_state1 = function(idx, value) {
        if (value === semicolon || value === space){
            //do nothing
        } else if (value !== returnline) {
            cur_state = self.name_state;
            cur_state(idx, value);
        } else {
            throw 'Form parse error: Newline in skip state 1';
        }
    }

    this.name_state = function(idx, value) {
        if (value === name_prefix[pointer]) {
            pointer += 1;
            if (pointer === name_prefix.length) {
                pointer = 0;
                cur_state = self.extract_name_state;
            }
        } else {
            throw 'Form parse error: Expecting key to be "name"';
        }
    }

    this.extract_name_state = function(idx, value) {
        if (value !== quote) {
            buffer.push(value);
        } else {
            cur_name = array2string(buffer);
            buffer.length = 0;
            cur_state = self.skip_state2;
        }
    }

    this.skip_state2 = function(idx, value) {
        if (value === semicolon || value === space){
            //do nothing
        } else if (value !== returnline) {
            isFile = true;
            cur_state = self.filename_state;
            cur_state(idx, value);
        } else {
            isFile = false;
            cur_state = self.newline_state3;
        }
    }

    this.filename_state = function(idx, value) {
        if (value === filename_prefix[pointer]) {
            pointer += 1;
            if (pointer === filename_prefix.length) {
                pointer = 0;
                cur_state = self.extract_filename_state;
            }
        } else {
            throw 'Form parse error: Expecting key to be "filename"'
        }
    }

    this.extract_filename_state = function(idx, value) {
        if (value !== returnline) {
            buffer.push(value);
        } else {
            buffer.pop();
            cur_filename = array2string(buffer);
            buffer.length = 0;
            cur_state = self.newline_state2;
        }
    }

    this.newline_state2 = function(idx, value) {
        if (value === newline) {
            cur_state = self.content_type_state;   
        } else {
            throw 'Form parser error: Expecting newline after filename';
        }
    }

    this.content_type_state = function(idx, value) {
        // console.log(idx, value, pointer, content_type_prefix[pointer], 'Content-Type:'[pointer]);
        if (value === content_type_prefix[pointer]) {
            pointer += 1;
            if (pointer === content_type_prefix.length) {
                pointer = 0;
                cur_state = self.skip_state3;
            }
        } else {
            throw 'Form parse error: Expecting "Content-Type"';
        }
    }

    this.skip_state3 = function(idx, value) {
        if (value === space) {
            //do nothing
        } else {
            cur_state = self.extract_content_type_state;
            cur_state(idx, value);
        }
    }

    this.extract_content_type_state = function(idx, value) {
        if (value != returnline) {
            buffer.push(value);
        } else {
            cur_content_type = array2string(buffer);
            buffer.length = 0;
            cur_state = self.newline_state3;
        }
    }

    this.newline_state3 = function(idx, value) {
        if (value === returnline) {
            // do nothing
        } else if (value === newline) {
            pointer += 1;
            if (pointer == 2) {
                pointer = 0;
                in_progress = true;
                start_index = idx+1;
                end_index = idx;
                if (isFile) {
                    var tmp_filepath = './tmp/tmpfile'+Date.now();
                    cur_writestream = fs.createWriteStream(tmp_filepath, {defaultEncoding: 'binary'});
                    data[cur_name] = {
                        filename: cur_filename,
                        content_type: cur_content_type,
                        tmp_filepath: tmp_filepath,
                    }
                    cur_state = self.content_boundary_state;
                } else {
                    cur_state = self.value_boundary_state;
                }
            }
        } else {
            throw 'Form parse error: Expecting last newline before actuall content but got '+cur[1];
        }
    }

    this.end_state = function() {
        // ignore everthing behind
    }

    this.parse_chunk = function(chunk) {
        // console.log(chunk.toString('ascii'));
        // console.log('parsing', chunk.length);
        total += chunk.length;
        if (total > post_multipart_max) {
            throw 'Exceed size limit.'
        }

        cur_chunk = chunk;
        for (var i = 0; i < cur_chunk.length; i++) {
            cur_state(i, cur_chunk[i]);
        }

        var ok = true;
        if (in_progress) {
            if (!isFile) {
                if (pre_chunk) {
                    if (pre_chunk.length + end_index - start_index + 1 > post_max) {
                        throw 'Exceed non-file size limit';
                    } else {
                        pre_chunk = Buffer.concat([pre_chunk, cur_chunk.slice(start_index, end_index+1)], pre_chunk.length + end_index - start_index + 1);
                    }
                } else {
                    pre_chunk = cur_chunk.slice(start_index, end_index+1);
                }
            } else {
                cur_size_accumulator += end_index - start_index + 1;
                if (start_index < 0) {
                    // console.log('remaining in progress!!!!', start_index);
                    cur_writestream.write(content_boundary_buffer.slice(0, - start_index));
                    ok = cur_writestream.write(cur_chunk.slice(0, end_index+1));
                } else {
                    ok = cur_writestream.write(cur_chunk.slice(start_index, end_index+1));
                }
            }
            start_index = - pointer;
            end_index = - pointer - 1;
        }
        return ok;
    }

    var cur_state = this.start_boundary_state;

    request.body = data;
    request.on('data', function(chunk) {
        try{
            var ok = self.parse_chunk(chunk);
            if (!ok) {
                // console.log('Back pressure!')
                request.pause();
                cur_writestream.once('drain', function() {
                    request.resume();
                });
            }
        } catch(e) {
            console.log(e, e.stack)
            fail(e);
            for (name in request.body) {
                var field = request.body[name];
                if (field.filename) {
                    fs.unlink(field.tmp_filepath);
                }
            }
            request.destroy();
            request.closed = true;
        }
    });

    request.on('close', function() {
        console.log('Request closed!');
        for (name in request.body) {
            var field = request.body[name];
            if (field.filename) {
                fs.unlink(field.tmp_filepath);
            }
        }
        request.closed = true;
    });

    request.on('end', function() {
        success();
    });
}

module.exports = parseFormdata;
