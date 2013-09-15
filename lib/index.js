var fs = require('fs');
var ref = require('ref');
var debug = require('debug')('utmp');
var BufferedReader = require('./reader');
var os = require('os');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

try {
  var type = os.type().toLowerCase();
  var definitions = require("./" + type);
} catch (err) {
  console.error("os not supported:", type);
  throw err;
}


module.exports = Parser;

/**
 *
 * @param {String} filename file to begin parsing
 * @param {Integer} options.offset starting offset in file. default == 0
 * @param {Boolean} options.skip_errors skip errors.  default == false 
 * @param {Boolean} options.tail true if parser should continue to search for events after eof is reached. default == false
 */
function Parser(filename, options) {
  var self = this;
  
  options = options || {}; 

  self.options = options;
  self.filename = filename;
  self.events = {};

  self.offset = options.offset || 0;
  var size = fs.statSync(filename).size;

  if (self.offset > size) {
    throw new Error('File size too small: requested offset ' + offset + ' but filesize is really: ' + size); 
  }

//  self.fd = fs.openSync(filename, 'r'); 
  self.reader = new BufferedReader({
    filename: filename
  });
  
  self.bytes_to_read = 0;
  self.buffer = null; 
  self.last_read_position = self.offset;

  self.stopped = false;
};

util.inherits(Parser, EventEmitter);

/** 
 * Stop the parser.
 *
 * A 'end' event is emitted when the parser is complete.
 *
 * @public
 */
Parser.prototype.stop = function() {
  var self = this;

  if (!self.stopped) {
    self.stopped = true;
    debug('stopping parser: ', self.filename);
    self._end();
  }
};

/** 
 * Tell the parser to expect data of a certain size, and when read, call the callback. Used only by parsers.
 *
 * @private
 */
Parser.prototype.expect = function(size, callback) {
  var self = this;  
  self.bytes_to_read = size;
  self.on_data = callback;
  self._read();
}

/** 
 * Tell the parser to save the last read position, and look for a new utmp record..
 *
 * @private
 */
Parser.prototype.continue = function() {
  var self = this;
  self.last_read_position = self.offset;
  debug("Last read position: ", self.last_read_position);
  self.run();
}; 


/**
 * Run the parser
 *
 */
Parser.prototype.run = function() {
  
  var self = this;
  self.last_read_position = self.offset;
  if (!self.stopped) {
    self._read_record();
  } else {
    self._end(); 
  }
};

/**
 * Parser end handler.  To be called when parser is complete.
 * @private
 */
Parser.prototype._end = function() {
  var self = this;

  if (self.watch) {
    fs.unwatchFile(self.filename);
    self.watch = null;
  }

  if (self.reader) {
    self.emit('end', { position: self.last_read_position });
    self.reader.close();
    self.reader = null;
  };

};


/**
 * Called when no data is received, or count < expected count.
 * Unless `options.tail` is specified, this event will emit a 'eof' event and the parser will terminate.
 *
 * @private
 */
Parser.prototype._wait_for_data = function() {

  var self = this;

  if (typeof self.options.tail === 'undefined' || !self.options.tail) {
    debug("Received EOF");
    self._end();
    return;
  }

  self.emit('eof', { position: self.last_read_position });

  if (self.watch) {
    return; 
  }

  self.watch = fs.watchFile(self.filename, function(curr_stat, prev_stat) {

    if (self.watch) {
      fs.unwatchFile(self.filename);
      self.watch = null;
    }
   
    if (self.stopped) {
      self._end();
    }

    if (curr_stat.size < prev_stat.size) {
      debug("File was rolled over. exiting.");
      self.emit('rollover', { position: self.last_read_position });
    } else {
      self._read();
    }
  });
};

Parser.prototype._clear = function() {
  var self = this;
  self.buffer = null; 
  self.bytes_to_read = 0;
};

Parser.prototype.unpause = function() {
  var self = this;
  self.paused = false;
};

Parser.prototype.pause = function() {
  var self = this;
  self.paused = true;
};

Parser.prototype.error = function(msg) {
  var self = this;
  debug("[X]" + msg);
  self.emit('error', { msg: msg })
};

/** 
 * expect record
 * @private
 */
Parser.prototype._read_record = function() {
  var self = this;
 
  self.last_read_position = this.offset;

  self.expect(definitions.UtmpRecord.size, function(buffer) {
    try {
      var record  = definitions.parse(buffer);
      self.emit('data', record);
    } catch (err) {
      console.error("Error parsing record:", err.stack);
      self.emit('error', err);
    };
    self.continue();
  });
};


/** 
 * Read data from file into `this.buffer`
 * 
 * @private
 */
Parser.prototype._read = function() {

  var self = this;

  if (self.paused) {
    setTimeout(function() {
      self._read();
    }, 1000);
    return;
  }

  if (!self.reader) {
    // no reader - parser ended.
    debug('reader is closed');
    return;
  }

  var length = self.bytes_to_read;

  self.reader.read(self.offset, length, function(err, count, buffer) {
   
    self.offset += count;
    
    if (count > 0) {

      if (!self.buffer) {
        self.buffer = buffer;  
      } else {
        self.buffer = Buffer.concat([self.buffer, buffer], self.buffer.length + count) 
      }

    };
    if (!err && count == length) {

      var buf = self.buffer;
      self._clear();
      self.on_data(buf);

    } else {

      if (err) {
        console.log("[X] Parser error:", err);
      } 

      if (count != length) {
        debug("Expected " + length + " bytes, read " + count);
        self.bytes_to_read = length - count;
        self._wait_for_data(); 
      }
    }
  });
};


