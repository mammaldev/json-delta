var deepEqual = require('deep-equal');
var CHANGE_TYPES = require('./constants').CHANGE_TYPES;

module.exports = mergeConflicts;

function mergeConflicts ( theirsDiff, yoursDiff ) {
  var conflicts = [];
  var tVars = { changes: copySortDiffForAnalysis(theirsDiff) };
  var yVars = { changes: copySortDiffForAnalysis(yoursDiff) };

  [ tVars, yVars ].forEach(function( vars, i, arr ) {
    vars.currChange = null;
    vars.currArrayChanges = null;
    vars.ix = 0;
    vars.otherDiffVars = arr[ 1 - i ];
  });

  while (
      ( tVars.currChange = tVars.changes[ tVars.ix ] ) &&
      ( yVars.currChange = yVars.changes[ yVars.ix ] )
  ) {
    var order = orderChanges(tVars.currChange, yVars.currChange);

    if ( order === -1 ) {
      if ( !pathContainsPath(tVars.currChange.path, yVars.currChange.path) ) {
        tVars.ix++;
        continue;
      }
    } else if ( order === 1 ) {
      if ( !pathContainsPath(yVars.currChange.path, tVars.currChange.path) ) {
        yVars.ix++;
        continue;
      }
    }

    // inner path is within outer path, or paths are equal

    if (
        ( order > 0 || isArrayItemsChange(tVars.currChange) ) &&
        ( order < 0 || isArrayItemsChange(yVars.currChange) )
    ) {
      // reaching here implies:
      //    -> array items change: REMOVE_ITEMS, REORDER_ITEMS, INSERT_ITEM
      //    -> array itself not deleted / updated on either theirs or yours

      var arrayPath = ( order === -1 ? tVars : yVars).currChange.path.slice();

      // populate [ty]Vars.currentArrayChanges
      [ tVars, yVars ].forEach(function( diffVars ) {

        diffVars.currArrayChanges = {
          remove: null,
          reorder: null,
          inserts: []
        };

        while (
          diffVars.currChange &&
          equal(diffVars.currChange.path, arrayPath)
        ) {
          switch ( diffVars.currChange.changeType ) {

            case CHANGE_TYPES.REMOVE_ITEMS:
              diffVars.currArrayChanges.remove = diffVars.currChange;
              break;

            case CHANGE_TYPES.REORDER_ITEMS:
              diffVars.currArrayChanges.reorder = diffVars.currChange;
              break;

            case CHANGE_TYPES.INSERT_ITEM:
              diffVars.currArrayChanges.inserts.push(diffVars.currChange);
              break;
          }

          diffVars.currChange = diffVars.changes[ ++diffVars.ix ];
        }
      });

      // check for reorder conflict
      if (
          tVars.currArrayChanges.reorder &&
          yVars.currArrayChanges.reorder
      ) {
        tVars.reordering = tVars.currArrayChanges.reorder.reordering.slice();
        yVars.reordering = yVars.currArrayChanges.reorder.reordering.slice();

        [ tVars, yVars ].forEach(function ( diffVars, i ) {
          // map post-REMOVE_ITEMS indices to pre-REMOVE_ITEMS indices
          if ( diffVars.currArrayChanges.remove ) {
            diffVars.currArrayChanges.remove.indices.forEach(function( removeIx ) {
              diffVars.reordering.forEach(function ( beforeIx, afterIx ) {
                if ( beforeIx >= removeIx ) {
                  diffVars.reordering[ afterIx ] = beforeIx + 1;
                }
              });
            });
          }

          // remove indices corresponding to REMOVE_ITEMS indices on other diff
          var otherDiffRemoveChange = diffVars.otherDiffVars.currArrayChanges.remove;
          if ( otherDiffRemoveChange ) {
            var i = 0;
            var beforeIx;
            while (
                ( beforeIx = diffVars.reordering[ i ] ),
                typeof beforeIx === 'number'
            ) {
              var afterIx = otherDiffRemoveChange.indices.indexOf(beforeIx);
              if ( ~afterIx ) {
                diffVars.reordering.splice(i, 1);
              } else {
                i++;
              }
            }
          }
        });

        if ( !equal(tVars.reordering, yVars.reordering) ) {
          conflicts.push({
            theirs: tVars.currArrayChanges.reorder,
            yours: yVars.currArrayChanges.reorder
          });
        }
      }

      // check for conflicts between REMOVE_ITEMS on one diff, and changes to item descendents  on other
      // N.B. adding id to array item removed on other diff is exceptional in that it doesn't conflict
      [ tVars, yVars ].forEach(function( diffVars, i ) {
        if ( !diffVars.otherDiffVars.currArrayChanges.remove ) {
          return;
        }

        var otherDiffRemoveChange = diffVars.otherDiffVars.currArrayChanges.remove;
        var incIx = 0;
        var descendentChange;

        while (
          ( descendentChange = diffVars.changes[ diffVars.ix + incIx++ ] ) &&
          pathContainsPath(arrayPath, descendentChange.path)
        ) {
          var isAddIdChange = descendentChange.changeType === CHANGE_TYPES.ADD_PROPERTY &&
            descendentChange.path.length === arrayPath.length + 2 &&
            !!~this.idKeys.indexOf(descendentChange.path[ arrayPath.length + 1 ]);

          var itemIx = descendentChange.path[ arrayPath.length ];

          if ( ~otherDiffRemoveChange.indices.indexOf(itemIx) && !isAddIdChange ) {
            conflicts.push({
              theirs: i === 0 ? descendentChange : otherDiffRemoveChange,
              yours:  i === 0 ? otherDiffRemoveChange : descendentChange
            });
          }
        }
      }, this);
      
      // conflict if items added to array on both theirs and yours
      if (
          tVars.currArrayChanges.inserts.length &&
          yVars.currArrayChanges.inserts.length
      ) {
        var byIndex = function byIndex ( c1, c2 ) {
          return c1.index - c2.index;
        };
        conflicts.push({
          theirs: tVars.currArrayChanges.inserts.sort(byIndex),
          yours: yVars.currArrayChanges.inserts.sort(byIndex)
        });
      }

      continue;
    }

    if ( !equal(tVars.currChange, yVars.currChange) ) {
      conflicts.push({ theirs: tVars.currChange, yours: yVars.currChange });
    }

    if ( order >= 0 ) { tVars.ix++; }
    if ( order <= 0 ) { yVars.ix++; }
  }

  return conflicts;
}

function pathContainsPath ( outer, inner ) {
  return equal(outer, inner.slice(0, outer.length));
}

function copySortDiffForAnalysis( diff ) {
  return JSON.parse(JSON.stringify(diff)).sort(orderChanges);
}

function orderChanges ( c1, c2 ) {
  return (
      orderPaths(c1.path, c2.path) ||
      Number(isArrayItemsChange(c1)) - Number(isArrayItemsChange(c2)) // non-array-item changes first
  );
}

function orderPaths ( p1, p2 ) {
  for (
      var k1, k2, i = 0;
      k1 = p1[ i ], k2 = p2[ i ], ( k1 !== void(0) || k2 !== void(0) );
      i++
  ) {
    if ( k1 !== k2 ) {
      return ( k1 === void(0) || k1 < k2 ) ? -1 : 1;
    }
  }
  return 0;
}

function isArrayItemsChange ( change ) {
  return (
    change.changeType === CHANGE_TYPES.REMOVE_ITEMS ||
    change.changeType === CHANGE_TYPES.REORDER_ITEMS ||
    change.changeType === CHANGE_TYPES.INSERT_ITEM
  );
}

function equal ( a, b ) {
  return deepEqual(a, b, { strict: true });
}
