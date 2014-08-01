var fs = require('fs');
var expect = require('chai').expect;
var Delta = require('..');

setTimeout(function() {
  process.exit(1);
}, 2000);

describe('Delta instances', function () {

  describe('CHANGE_TYPES', function () {
    var delta = new Delta();

    it('should be exposed on JSONChanges instances', function () {
      expect(delta.CHANGE_TYPES).to.be.an('object');
    });

    it('should be read-only', function () {
      expect(delta.CHANGE_TYPES).to.not.equal(delta.CHANGE_TYPES);
    });
  });


  var docs = fs.readdirSync(__dirname + '/describes')
  .filter(function ( filename ) {
    return /\.json$/.test(filename);
  })
  .map(function ( filename ) {
    return JSON.parse(fs.readFileSync(__dirname + '/describes/' + filename));
  })
  .forEach(function ( doc ) {
    doc.descriptions.forEach(function ( behaviour ) {

      describe(behaviour, function () {

        doc.transforms.filter(function( transform ) {
          return transform.shoulds && transform.shoulds[ behaviour ];
        })
        .forEach(function ( transform ) {
          var should = transform.shoulds[ behaviour ];


          it('should ' + should, function() {
            switch ( behaviour ) {

              case 'diff':
                expect(delta.diff(transform.bfore, transform.after)).to.eql(transform.diff);
                break;

              case 'patch':
                var patch = delta.patch.bind(delta, transform.bfore, transform.diff);

                if ( transform.errors && transform.errors.patch ) {
                  expect(patch).to.throw(Error);
                } else {
                  expect(patch()).to.eql(transform.after);
                }
                break;

              case 'mergePatch':
                var result = delta.mergePatch(transform.diffs.baseTheirs, transform.diffs.baseYours);
                expect(result.conflicts).to.deep.have.members(transform.result.conflicts);
                break;
            }
          });
        });
      });
    });
  });
});
