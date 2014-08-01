var fs = require('fs');
var expect = require('chai').expect;
var Delta = require('..');

setTimeout(function() {
  process.exit(1);
}, 2000);

describe('Delta instances', function () {

  describe('Constants', function () {
    describe('CHANGE_TYPES', function () {
      var delta = new Delta();

      it('is exposed on Delta instances', function () {
        expect(delta.CHANGE_TYPES).to.be.an('object');
      });

      it('is read-only', function () {
        expect(delta.CHANGE_TYPES).to.not.equal(delta.CHANGE_TYPES);
      });
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
    doc.methods.forEach(function ( method ) {

      describe(method, function () {

        doc.transforms.filter(function( transform ) {
          return transform.methods && transform.methods[ method ];
        })
        .forEach(function ( transform, i ) {
          var delta = new Delta(transform.opts);

          describe(transform.description, function () {
            var expectError = transform.methods[ method ].error;
            var itDesc = transform.methods[ method ].it;
            var result;

            switch ( method ) {
              case 'diff':
                it(itDesc || 'returns expected diff', function () {
                  expect(delta.diff(transform.before, transform.after)).to.eql(transform.diff);
                });
                break;

              case 'patch':
                var patch = delta.patch.bind(delta, transform.before, transform.diff);

                it(itDesc || ( expectError ? 'should throw error' : 'applies patch and returns object equal to after' ), function () {
                  if ( expectError ) {
                    expect(patch).to.throw(Error);
                  } else {
                    expect(patch()).to.eql(transform.after);
                  }
                });
                break;

              case 'mergePatch':
                var expectation = transform.expectation;
                result = delta.mergePatch(transform.diffs.baseTheirs, transform.diffs.baseYours);

                it('returns object with properties "success" - boolean, "conflicts" - array (set), "patch" - array or null', function () {
                  expect(result).to.be.an('object');
                  expect(Object.keys(result)).to.have.members([ 'success', 'conflicts', 'patch' ]);
                  expect(result.success).to.be.a('boolean');
                  expect(result.conflicts).to.be.an('array');
                  expect(Array.isArray(result.patch) || result.patch === null);
                });

                it('success: ' + expectation.success, function () {
                  expect(result.success).to.equal(expectation.success);
                });

                it('conflicts: ' + ( itDesc.conflicts || ( expectation.conflicts.length ? 'expected set of conflicts' : 'empty array' )), function () {
                  expect(result.conflicts).to.deep.have.members(expectation.conflicts);
                });

                it('patch: ' + ( itDesc.patch || ( expectation.patch ? 'expected patch' : 'null' )), function () {
                  if ( expectation.patch ) {
                    expect(result.patch).to.eql(expectation.patch);
                  } else {
                    expect(result.patch).to.equal(null);
                  }
                });
                break;
            }
          });
        });
      });
    });
  });
});
