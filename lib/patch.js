module.exports = patch;

function patch ( before, diff ) {
  var CHANGE_TYPES = this.CHANGE_TYPES;

  // makes updates to entire doc (array) easier
  var wrapper = {
    after: JSON.parse(JSON.stringify(before))
  };

  diff.forEach(function ( change ) {
    var path = [ 'after' ].concat(change.path);

    var key;
    if (
      change.changeType !== CHANGE_TYPES.REMOVE_ITEMS &&
      change.changeType !== CHANGE_TYPES.INSERT_ITEM
    ) {
      key = path.pop();
    }

    var tar = valueAtPath(wrapper, path);

    switch ( change.changeType ) {
      case CHANGE_TYPES.UPDATE_PROPERTY:
      case CHANGE_TYPES.ADD_PROPERTY:

        tar[ key ] = change.value;
        break;

      case CHANGE_TYPES.DELETE_PROPERTY:

        delete tar[ key ];
        break;

      case CHANGE_TYPES.INSERT_ITEM:

        tar.splice(change.index, 0, change.item);
        break;

      case CHANGE_TYPES.REMOVE_ITEMS:
        removeItems(tar, change.indices);
        break;

      case CHANGE_TYPES.REORDER_ITEMS:
        tar[ key ] = reorderArray(tar[ key ], change.reordering);
        break;

      default:
        var err = new Error('Unrecognised changeType');
        err.data = change;
        throw err;
    }
  });

  return wrapper.after;
}

function valueAtPath ( doc, path ) {
  var val = doc;

  for ( var i = 0; i < path.length; i++ ) {
    val = val[ path[ i ] ];
  }

  return val;
}

function removeItems ( arr, indices ) {
  for ( var i = 0; i < indices.length; i++ ) {
    arr.splice(indices[ i ] - i, 1);
  }
}

function reorderArray ( arr, ordering ) {
  var reordered = [];

  ordering.forEach(function ( ixAfter, ixBfore ) {
    reordered[ ixAfter ] = arr[ ixBfore ];
  });

  return reordered;
}
