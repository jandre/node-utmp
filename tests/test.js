var UtmpParser = require('../lib');

var p = new UtmpParser('/var/run/utmpx');
p.on('data', function(d) {
  console.log("got record:", d);
})
p.run();
