module.exports = {};

Object.defineProperty(module.exports, 'CHANGE_TYPES', {
  enumerable: true,
  get: function () {
    return {
      ADD_PROPERTY: 'ADD_PROPERTY',
      UPDATE_PROPERTY: 'UPDATE_PROPERTY',
      DELETE_PROPERTY: 'DELETE_PROPERTY',
      INSERT_ITEM: 'INSERT_ITEM',
      REMOVE_ITEMS: 'REMOVE_ITEMS',
      REORDER_ITEMS: 'REORDER_ITEMS',
    };
  }
});
