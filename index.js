var Constants = require('./lib/constants');
var diff = require('./lib/diff');
var patch = require('./lib/patch');
var merge = require('./lib/merge');

module.exports = Delta;

function Delta( opts ) {
  opts = opts || {};
  this.idKeys = Array.isArray(opts.idKeys) ? opts.idKeys : [ '_id', 'ref' ];

  var self = this;
  Object.keys(Constants).forEach(function ( key ) {
    Object.defineProperty(self, key, {
      enumerable: true,
      get: function () {
        return Constants[ key ];
      }
    });
  });
}

Delta.prototype.diff = diff;
Delta.prototype.patch = patch;
Delta.prototype.mergeConflicts = merge;
