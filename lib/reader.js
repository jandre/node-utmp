var fs = require('fs');
var debug = require('debug')('utmp');

module.exports = BufferedReader;

/** 
 * Buffered reader that doesn't suck ass.
 *
 * @param `options.bufsize` - size of initial buffer to use. but we'll auto adjust to bigger if needed.
 * 
*/

function BufferedReader(options) {
  var self = this; 
  options = options || {};
  options.bufsize = options.bufsize || 4096 * 5;

  self.fd = options.fd || fs.openSync(options.filename, 'r')
  self.bufsize = options.bufsize;
  self.buffer = new Buffer(options.bufsize);
  self.offset = 0; // offset in file.
  self.length = 0; // bytes currently in buffer.
  self.fd_offset = 0; // current offset in fd.
};

BufferedReader.prototype.close = function() {
  var self = this;

  if (self.fd) {
    fs.closeSync(self.fd);
    self.fd = null;
  }
}

/**
 * true if requested data is in window
 *
 * @param {Number} offset - offset in file to read 
 * @param {Number} length - length of data to read
*/
BufferedReader.prototype._in_window = function(offset, length) {
  var self = this; 

  var in_window = (offset >= self.offset) && ((self.offset + self.length) > (offset + length));
  debug("in window:", in_window, "my offset:", self.offset,"offset:", offset, "size:", self.length);
  return in_window;
};


BufferedReader.prototype._load = function(offset, length, callback) {
  var self = this;

  if (length > self.bufsize) {
    self.bufsize = length * 2; // double every time?
    self.buffer = new Buffer(self.bufsize);
  }

  var start = offset;

  fs.read(self.fd, self.buffer, 0, self.bufsize, start, function(err, count_read, buffer) {

    self.buffer = buffer;
    self.offset = offset;
    self.length = count_read;
    self.fd_offset = offset + count_read;

    debug('read bytes from file start:', start,
          "count:", count_read, "start:", start, buffer);

          if (count_read < length) {
            // copy the bytes to a new, shorter buffer and return that.
            callback(err, count_read, self._slice(0, count_read));
          } else {
            // return only the amt we care about
            callback(err, length, self._slice(0, length));
          }
  });

};

BufferedReader.prototype._slice = function(start, end) {
  var size = 0;
  var buf = new Buffer(end - start);
  this.buffer.copy(buf, 0, start, end);
  debug("copying start:", start, "end:", end, buf);
  return buf;
}

/**
 * Buffer data in the window.  
 *
*/
BufferedReader.prototype._fetch = function(offset, length, callback) {
  var self = this; 
  var buffer = self.buffer;

  if (self._in_window(offset, length)) {
    var start = offset - self.offset;
    debug('returning offset:', offset, "count:", 
          length, "starting:", start, "size:", self.length);

          var buf = self._slice(start, start + length)
          return callback(null, length, buf);
  } else {

    // we matched some data in the buffer.  let's make up the difference.
    if (offset < self.offset || (offset) > (self.offset + self.length)) {
      // just reset and load if we're going back in time anyway.
      return self._load(offset, length, callback);
    } else {
      var start = offset - self.offset;
      var end = self.length;
      var tmp = self._slice(start, end);
      var bytes_read = end - start;

      var new_start = (offset + bytes_read);
      var new_length = (length - bytes_read);

      self._load(new_start, new_length, function(err, count, buffer) {
        return callback(err, count + bytes_read, Buffer.concat([tmp, buffer]));
      });
    }
  }
};



/**
 * Read `count` bytes starting from position `position` in file. 
 *
 * @public
*/
BufferedReader.prototype.read = function(offset, count, callback) {
  var self = this;

  //debug('XXX:requesting bytes at offset:', offset, "count:", count);
  return self._fetch(offset, count, function(err, count, buffer) {
    // debug('got bytes:', buffer); 
    callback(err, count, buffer);
  });

};

