var deepEqual = require('deep-equal');
var CHANGE_TYPES = require('./constants').CHANGE_TYPES;

module.exports = mergePatch;

function mergePatch ( theirsDiff, yoursDiff ) {
  var tVars = { changes: copySortDiffForAnalysis(theirsDiff) };
  var yVars = { changes: copySortDiffForAnalysis(yoursDiff) };
  var patch = tVars.changes.slice();
  var conflicts = [];

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
    var order = orderChangesForAnalysis(tVars.currChange, yVars.currChange);

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

      var arrayPath = ( order === -1 ? tVars : yVars ).currChange.path.slice();
      var patchRemove;
      var patchReorder;
      var patchInsertions = [];

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
              if ( diffVars === tVars ) {
                patchRemove = patch[ tVars.ix ];
              }
              break;

            case CHANGE_TYPES.REORDER_ITEMS:
              diffVars.currArrayChanges.reorder = diffVars.currChange;
              if ( diffVars === tVars ) {
                patchReorder = patch[ tVars.ix ];
              }
              break;

            case CHANGE_TYPES.INSERT_ITEM:
              diffVars.currArrayChanges.inserts.push(diffVars.currChange);
              if ( diffVars === tVars ) {
                patchInsertions.push(patch[ tVars.ix ]);
              }
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
          var itemIx = descendentChange.path[ arrayPath.length ];
          if ( ~otherDiffRemoveChange.indices.indexOf(itemIx) && !isAddIdChange(descendentChange, this.idKeys) ) {
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

      if ( !conflicts.length ) {
        var yRemoveIndices = yVars.currArrayChanges.remove && yVars.currArrayChanges.remove.indices;
        var tRemoveIndices = tVars.currArrayChanges.remove && tVars.currArrayChanges.remove.indices;
        var yReordering = yVars.currArrayChanges.reorder && yVars.currArrayChanges.reorder.reordering;
        var tReordering = tVars.currArrayChanges.reorder && tVars.currArrayChanges.reorder.reordering;

        // yReorder & tReorder & no conflicts => yReorder and tReorder are same
        // except for potentially containing items removed on other diff
        if ( yReordering && tReordering ) {
          patchReorder.omit = true;
          patchReorder = null;
        }

        var ixPostYRemove = function ( preIx ) {
          return yRemoveIndices ?
            preIx - yRemoveIndices.filter(function ( i ) { return i < preIx; }).length :
            preIx;
        };

        var ixPostYReorder = function ( preIx ) {
          return yReordering ?
            yReordering.indexOf(preIx) :
            preIx;
        }

        // apply yRemove to array items changes
        if ( yRemoveIndices ) {
          // update patchRemove
          if ( patchRemove ) {

            patchRemove.indices = patchRemove.indices.filter(function( i ) {
              return !~yRemoveIndices.indexOf(i);
            })
            .map(ixPostYRemove);

            if ( !patchRemove.indices.length ) {
              patchRemove.omit = true;
            }
          }
          
          // update patchReorder
          if ( patchReorder ) {
            yRemoveIndices
            .filter(function ( ix ) {
              return !tRemoveIndices || !~tRemoveIndices.indexOf(ix);
            })
            .forEach(function( yRemIx, decrement ) {
              var countLTInTheirs = 0;

              if ( tRemoveIndices ) {
                for ( var i = 0; i < tRemoveIndices.length; i++ ) {
                  if ( tRemoveIndices[ i ] > yRemIx ) {
                    break;
                  }
                  countLTInTheirs++;
                }
              }

              var pReorderCurrVal = yRemIx - countLTInTheirs - decrement;

              for (
                var j = 0, pVal;
                !isNaN( ( pVal = patchReorder.reordering[ j ] ) );
              ) {
                if ( pVal === pReorderCurrVal ) {
                  patchReorder.reordering.splice(j, 1);
                } else {
                  if ( pVal > pReorderCurrVal ) {
                    patchReorder.reordering[ j ]--;
                  }
                  j++;
                }
              }
            });
          }

          // update patchInsertions
          patchInsertions.forEach(function( c ) {
            c.index = ixPostYRemove(c.index);
          });
        }

        // apply yReordering to array items changes
        if ( yReordering ) {
          if ( patchRemove ) {
            patchRemove.indices = patchRemove.indices.map(ixPostYReorder);
          }
          // patchReordering omitted if it exists
          // insertions unaffected by yReordering
        }

        // apply yRemove & yReorder to array descendent changes
        var incIx = -1;
        var descendent;

        while (
          ( descendent = patch[ tVars.ix + ++incIx ] ) &&
          pathContainsPath(arrayPath, tVars.changes[ tVars.ix + incIx ].path)
        ) {
          var ixPreY = descendent.path[ arrayPath.length ];
          if ( yRemoveIndices && ~yRemoveIndices.indexOf(ixPreY) && isAddIdChange(descendent, this.idKeys) ) {
            descendent.omit = true;
          }
          descendent.path[ arrayPath.length ] = ixPostYReorder(ixPostYRemove(ixPreY));
        }
      }

      continue;
    }

    if (
        !equal(tVars.currChange, yVars.currChange) &&
        !isAddIdChange(( order == -1 ? yVars.currChange : tVars.currChange ), this.idKeys)
    ) {
      conflicts.push({ theirs: tVars.currChange, yours: yVars.currChange });
    } else if ( !conflicts.length ) {
      patch[ tVars.ix ].omit = true;
    }

    if ( order >= 0 ) { tVars.ix++; }
    if ( order <= 0 ) { yVars.ix++; }
  }

  return {
    success: !conflicts.length,
    patch: conflicts.length ? null : patch.filter(function( c ) { return !c.omit; }).sort(orderPatchChanges),
    conflicts: conflicts
  };
}

function pathContainsPath ( outer, inner ) {
  return equal(outer, inner.slice(0, outer.length));
}

function copySortDiffForAnalysis( diff ) {
  return JSON.parse(JSON.stringify(diff)).sort(orderChangesForAnalysis);
}

function orderChangesForAnalysis ( c1, c2 ) {
  return (
      orderPaths(c1.path, c2.path) ||
      Number(isArrayItemsChange(c1)) - Number(isArrayItemsChange(c2)) // non-array-item changes first
  );
}

function orderPatchChanges ( c1, c2 ) {
  var c1IsArr = isArrayItemsChange(c1);
  var c2IsArr = isArrayItemsChange(c2);
  var pathOrder = orderPaths(c1.path, c2.path);

  if (
      ( !c1IsArr && !c2IsArr ) ||
      !pathContainsPath(( pathOrder < 1 ? c1 : c2 ).path, ( pathOrder < 1 ? c2 : c1 ).path)
  ) {
    return pathOrder;
  }

  if ( pathOrder === 0 ) {
    // array items changes on same array
    var orderedTypes = [ CHANGE_TYPES.REMOVE_ITEMS, CHANGE_TYPES.REORDER_ITEMS, CHANGE_TYPES.INSERT_ITEM ];
    return (
        sign(orderedTypes.indexOf(c1.changeType) - orderedTypes.indexOf(c2.changeType)) ||
        ( c1.index - c2.index ) // both INSERT_ITEM
    );
  }

  // outer change is array items change
  return -pathOrder;
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

function isAddIdChange ( change, idKeys ) {
  return (
    change.changeType === CHANGE_TYPES.ADD_PROPERTY &&
    typeof change.path[ change.path.length - 2 ] === 'number' &&
    !!~idKeys.indexOf(change.path[ change.path.length - 1 ])
  );
}

function equal ( a, b ) {
  return deepEqual(a, b, { strict: true });
}

function sign ( x ) {
  return x ? x < 0 ? -1 : 1 : 0;
}
