var deepEqual = require('deep-equal');
var CHANGE_TYPES = require('./constants').CHANGE_TYPES;

module.exports = diff;

function diff ( bfore, after ) {
  if ( typeof bfore !== 'object' || typeof after !== 'object' ) {
    throw new Error('arguments must both be one of null / object / array');
  }

  if ( equal(bfore, after) ) {
    return [];
  }

  if ( !bfore || !after || Array.isArray(bfore) !== Array.isArray(after) ) {
    return [ {
      path: [],
      changeType: CHANGE_TYPES.UPDATE_PROPERTY,
      value: after
    } ];
  }

  return ( Array.isArray(bfore) ? diffArrays : diffObjects )(this.idKeys, bfore, after, []);
};

function diffObjects ( idKeys, bfore, after, path ) {
  var changes = [];

  var keys = Object.keys(after).reduce(function ( allKeys, key ) {
    if ( !~allKeys.indexOf(key) ) {
      allKeys.push(key);
    }
    return allKeys;
  }, Object.keys(bfore)).sort();
  
  keys.forEach(function ( key ) {
    var bforeProp = bfore[ key ];
    var afterProp = after[ key ];

    if ( equal(bforeProp, afterProp) ) {
      return [];
    }

    var changeType;

    if ( typeof bforeProp === 'undefined' ) {
      changeType = CHANGE_TYPES.ADD_PROPERTY;
    } else if ( typeof afterProp === 'undefined' ) {
      changeType = CHANGE_TYPES.DELETE_PROPERTY;
    } else if (
        typeof bforeProp != typeof afterProp ||
        typeof bforeProp != 'object' ||
        bforeProp === null ||
        afterProp === null ||
        Array.isArray(bforeProp) != Array.isArray(afterProp)
    ) {
      changeType = CHANGE_TYPES.UPDATE_PROPERTY;
    }

    if ( changeType ) {
      var change = {
        path: path.concat(key),
        changeType: changeType,
      }

      if ( changeType && changeType !== CHANGE_TYPES.DELETE_PROPERTY ) {
        change.value = afterProp;
      }

      return changes.push(change);
    }

    if ( Array.isArray(bforeProp) ) {
      changes = changes.concat(diffArrays(idKeys, bforeProp, afterProp, path.concat(key)));
    } else { // obj
      changes = changes.concat(diffObjects(idKeys, bforeProp, afterProp, path.concat(key)));
    }
  });

  return changes;
}

function diffArrays ( idKeys, bforeArray, afterArray, path ) {
  // if array contains primitives or arrays, we're not able to classify more specifically than array update
  if ( bforeArray.some(notObject) || afterArray.some(notObject) ) {
    return [
      {
        path: path,
        changeType: CHANGE_TYPES.UPDATE_PROPERTY,
        value: afterArray
      }
    ];
  }

  var getArrayItemId = function ( item ) {
    for ( var i = 0; i < idKeys.length; i++ ) {
      var key = idKeys[ i ];
      var id = item[ key ];
      if ( typeof id === 'string' ) {
        return id;
      }
    }
  };

  var bforeItemIds = bforeArray.map(getArrayItemId);
  var afterItemIds = afterArray.map(getArrayItemId);

  // Consider special case where item is updated from having no ID to having an ID:
  // If an ID-less object in bfore is otherwise identical with an ID'd object in after that doesn't have an ID match in bfore
  // we pair the bforeItem and the afterItem and record the change as an UPDATE rather than a REMOVE and an ADD

  // track indices of id-less bforeArray items that are UPDATED with an id (stops them getting processed as REMOVE)
  var setIdBforeAfterIxDict = {};
  var afterIdsPairedWithBforeNoId = [];

  var changes = [];

  var afterIdItemDict = afterItemIds.reduce(function ( dict, id, i ) {
    if ( id ) {
      dict[ id ] = afterArray[ i ];
    }
    return dict;
  }, {});

  // REMOVED AND UPDATED ITEMS
  var removedItemsIndices = [];

  // CHANGED ITEMS
  bforeItemIds.forEach(function ( bId, bIx ) {
    if ( !bId ) {
      for ( var aIx = 0; aIx < afterArray.length; aIx++ ) {
        var aId = afterItemIds[ aIx ];

        if ( !aId || ~bforeItemIds.indexOf(aId) || afterIdsPairedWithBforeNoId[ aId ] ) {
          continue;
        }

        var itemDiff = diffObjects(idKeys, bforeArray[ bIx ], afterArray[ aIx ], path.concat(bIx));

        var noMatch = itemDiff.some(function ( change ) {
          return (
            change.changeType != CHANGE_TYPES.ADD_PROPERTY ||
            typeof change.path[ change.path.length - 2 ] !== 'number' ||
            !~idKeys.indexOf(change.path[ change.path.length - 1 ])
          );
        });

        if ( !noMatch ) {
          setIdBforeAfterIxDict[ bIx.toString() ] = aIx;
          afterIdsPairedWithBforeNoId.push(aId);
          changes = changes.concat(itemDiff);
          return;
        }
      }
    }

    var aItem = afterIdItemDict[ bId ];

    if ( !aItem ) {
      removedItemsIndices.push(bIx);
    } else {
      changes = changes.concat(diffObjects(idKeys, bforeArray[ bIx ], aItem, path.concat(bIx)));
    }
  });

  // if there are items without ids in both bforeArray and afterArray (excluding those in bforeArray paired with ID'd items in afterArray), we classify entire array as updated and exit
  var afterContainsNoIdItem = afterItemIds.some(function ( id ) {
    return !id;
  });

  var bforeContainsUnpairedNoIdItem = bforeItemIds.some(function ( id, bIx ) {
    return !id && typeof setIdBforeAfterIxDict[ bIx.toString() ] !== 'number';
  });

  if ( afterContainsNoIdItem && bforeContainsUnpairedNoIdItem ) {
    return [
      {
        path: path,
        changeType: CHANGE_TYPES.UPDATE_PROPERTY,
        value: afterArray
      }
    ];
  }

  // array itself not classified as UPDATED (N.B. it might be reordered)

  // REMOVED ITEMS
  if ( removedItemsIndices.length ) {
    changes.push({
      path: path,
      changeType: CHANGE_TYPES.REMOVE_ITEMS,
      indices: removedItemsIndices
    });
  }

  // REORDER ARRAY
  var numPriorAddedItems = afterItemIds.reduce(function ( ret, id ) {
    ret.arr.push(ret.count);

    if ( !id || ( !~bforeItemIds.indexOf(id) && !~afterIdsPairedWithBforeNoId.indexOf(id) ) ) {
      ret.count++;
    }

    return ret;
  }, { arr: [], count: 0 }).arr;

  var reordering = bforeItemIds.reduce(function ( ret, bId, bIx ) {
    var aId = bId || afterItemIds[ setIdBforeAfterIxDict[ bIx ] ];
    var aIx = aId ? afterItemIds.indexOf(aId) : -1;

    if ( ~aIx ) {
      ret.push(aIx - numPriorAddedItems[ aIx ]);
    }

    return ret;
  }, []);

  var isReordered = reordering.some(function ( ixBfore, ixAfter ) {
    return ixBfore != ixAfter;
  });

  if ( isReordered ) {
    changes.push({
      path: path,
      changeType: CHANGE_TYPES.REORDER_ITEMS,
      reordering: reordering
    });
  }

  // INSERTED ITEMS
  afterItemIds.forEach(function ( id, i ) {
    if ( !id || ( !~bforeItemIds.indexOf(id) && !~afterIdsPairedWithBforeNoId.indexOf(id) ) ) {
      changes.push({
        path: path,
        changeType: CHANGE_TYPES.INSERT_ITEM,
        index: i,
        item: afterArray[ i ]
      });
    }
  });

  return changes;
}

function equal ( a, b ) {
  return deepEqual(a, b, { strict: true });
}

function notObject ( v ) {
  return (
      !v ||
      typeof v != 'object' ||
      Array.isArray(v)
  );
}
