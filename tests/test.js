var UtmpParser = require('../lib');

var p = new UtmpParser('/var/log/wtmp.1');
p.on('data', function(d) {
  console.log("got record:", d);
})
p.run();
