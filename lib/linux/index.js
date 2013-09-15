var ref = require('ref');
var StructType = require('ref-struct');
var UnionType = require('ref-union');
var ArrayType = require('ref-array');
var debug = require('debug')('utmp');
var ip = require('ip');

// types for linux

var UT_LINESIZE = 32;
var UT_NAMESIZE = 32;
var UT_HOSTSIZE =  256;

var TYPE = {
  UT_UNKNOWN: 0,
  RUN_LVL: 1,
  BOOT_TIME: 2,
  NEW_TIME: 3,
  OLD_TIME: 4,
  INIT_PROCESS: 5,
  LOGIN_PROCESS: 6,
  USER_PROCESS: 7,
  DEAD_PROCESS: 8,
  ACCOUNTING: 9,
};

function lookup(id) {
  for (var k in TYPE) {
    if (TYPE[k] == id) 
      return k.toString();
  };
  return "UNKNOWN";
};

var pid_t = ref.types.int32;
var short_t = ref.types.int16;
var char_t = ref.types.char;
var uint32_t = ref.types.uint32;
var int32_t = ref.types.int32;

var exit_status_t = StructType({
  termination_status: short_t,
  exit_status: short_t
});

var NUL = String.fromCharCode("\\u0000");

var charstring  = function(size) {

  var array =  ArrayType(char_t, size); 

  array._get = array.get;
  array.get = function(buf, offset) {
    var string = this._get(buf, offset).buffer.toString();
    var nul = string.indexOf(NUL);
     if (nul >= 0) {
        return string.substring(0, nul);
     }
     return string;
  };

  return array;

};

function iplong2str(ip) {
  var d = (ip) & 0xff;
  var c = (ip >> 8) & 0xff;
  var b = (ip >> 16) & 0xff;
  var a = (ip >> 24) & 0xff;
  return a + "." + b + "." + c + "." + d;
}

var ip6addr_string = {
  size: 16
  , indirection: 1
  , alignment: 4
  , get: function get (buf, offset) {

    if (buf[offset + 0] == 0 && buf[offset + 1] == 0 && buf[offset + 2] == 0xFFFF)
      return iplong2str(buf[offset + 3]);

    return ip.toString(buf, offset || 0, this.size);
  }
  , set: function set (buf, offset, val) {
    return ip.toBuffer(val, buf, offset || 0);
  }
};

var timeval_t = StructType({
  tv_sec: int32_t,
  tv_usec: int32_t
}); 

var UtmpRecord = StructType({
 type: short_t,
 pid: pid_t,
 line: charstring(UT_LINESIZE),
 ut_id: uint32_t, //  ArrayType(char_t, 4), 
 user:  charstring(UT_NAMESIZE), 
 host:  charstring(UT_HOSTSIZE), 
 exit_status: exit_status_t,
 session: int32_t,
 tv: timeval_t,
 address: ip6addr_string, 
 __unused: ArrayType(char_t, 20)
});

exports.UtmpRecord = UtmpRecord;
exports.timeval_t = timeval_t;
exports.exit_status_t = exit_status_t;
exports.UtmpRecordType = TYPE;

exports.parse = function(buffer) {
  var record = new UtmpRecord(buffer);

  var result = {
    type: lookup(record.type),
    pid: record.pid,
    line: record.line,
    id: record.ut_id,
    user: record.user.toString(),
    host: record.host.toString(),
    exit_status: {
      termination: record.exit_status.termination_status,
      code: record.exit_status.exit_status
    },
    session: record.session,
    timestamp: new Date(record.tv.tv_sec * 1000) ,
    address: record.address 
  };

  return result;
};
