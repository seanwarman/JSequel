module.exports = class JsonQL {
  // constructor=>
  constructor(schema) {
    this.schema = schema;
    this.errors = [];
    this.fatalError = false;

    this.select = ''
    this.from = '';
    this.where = '';

    this.dbTableNames = [];
    this.customFns = {};
    this.nestedAS = '';
  }

  // addCustomFns=>
  addCustomFns(customFns) {
    this.customFns = customFns;
  }

  // +~====***************====~+
  // +~====**ENTRYPOINTS**====~+
  // +~====***************====~+

  // selectSQ=>
  selectSQ(queryObj) {
    const treeMap = this.buildTreeMap([queryObj])
    let query = this.buildSelect(queryObj, treeMap);

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query: ''
      }
    }

    return {
      status: 'success',
      errors: this.errors,
      query
    }
  }
  // createSQ=>
  createSQ(queryObj, data) {
    let query = this.buildCreate(queryObj, data);

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query: ''
      }
    }

    return {
      status: 'success',
      errors: this.errors,
      query
    }
  }
  // updateSQ=>
  updateSQ(queryObj, data) {
    let query = this.buildUpdate(queryObj, data);

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query: ''
      }
    }

    return {
      status: 'success',
      errors: this.errors,
      query
    }
  }
  // deleteSQ=>
  deleteSQ(queryObj) {
    let query = this.buildDelete(queryObj);

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query: ''
      }
    }

    return {
      status: 'success',
      errors: this.errors,
      query
    }
  }

  // +~====********====~+
  // +~====**DATA**====~+
  // +~====********====~+

  // setValueString=>
  setValueString(value) {
    if(!value) return null;
    if(typeof value === 'object' && value.forEach) {
      return `JSON_ARRAY(${value.map(val => this.setValueString(val)).join()})`;
    }
    if(typeof value === 'object' && !value.forEach) {
      return `JSON_OBJECT(${Object.keys(value).map(key => `${this.setValueString(key)}, ${this.setValueString(value[key])}`).join()})`;
    }
    if(typeof value === 'boolean') {
      return `${value}`;
    }
    if(typeof value === 'number') {
      return `${value}`;
    }
    if(typeof value === 'string' && value === 'NULL') {
      return `NULL`;
    }
    if(typeof value === 'string') {
      return `'${value}'`;
    }
  }

  // setJQString=>
  setJQString(db, table, key, value) {
    if(!value) return;
    let column = this.extractColFromJQString(db, table, key);

    value = `IF(
      ${this.jQSet(db, table, key, value)} IS NOT NULL,
      ${this.jQSet(db, table, key, value)},
      ${column}
    )`;

    return {column, value};
  }

  // parseData=>
  parseData(db, table, data) {
    let values = [];
    let columns = [];
    Object.keys(data).forEach(key => {
      let col;
      let val;
      if(/^\$/.test(key)) {
        let jqObj = this.setJQString(db,table,key,this.setValueString(data[key]));
        if(!jqObj) return;
        col = jqObj.column;
        val = jqObj.value;
      } else {
        val = this.setValueString(data[key]);
        col = key;
      }
      if(!val) return;
      if(!this.columnValid(db, table, col)) return;
      columns.push(col);
      values.push(val);
    });
    return {columns, values}
  }

  // +~====************====~+
  // +~====**'SELECT'**====~+
  // +~====************====~+

  // buildSelect=>
  buildSelect(queryObj, treeMap) {
    // If the `name` has a custom function return that first.
    if(/^\w+\=\>/.test(queryObj.name)) {
      return this.funcString(queryObj.name)
    }


    // The treeMap is an array of indexes showing us where everything
    // is in queryObj, we want to make another array to build our
    // select string with.
    const selectMap = treeMap.map(tree => {

      return this.createSelectMapFromTree([queryObj], tree)

      // Errored names will return null so filter them
      // out so the whole thing doesn't break and we
      // can return any errors properly.
    }).filter(sel => sel !== null)

    console.log('selectMap :', selectMap);

    // Now to build another array of selections each with a single target
    // column.
    const select = selectMap.map(sel => sel.map(col => {
      let {
        db,
        table,
        name,
        as,
        sort,
        limit,
        where
      } = this.splitSelectItems(col, col.dbTable)

      if(limit.length > 0) limit = ` LIMIT ${limit.join()}`
      if(where.length > 0) where = ` WHERE ${where.join(' AND ')}`
      if(sort.length > 0) sort = ` SORT ${sort}`
      if(as.length > 0) as = ` AS ${as}`

      return `(SELECT ${name} FROM ${db}.${table}${where}${sort}${limit})${as}`

    }))

    console.log('select :', select);


  }

  // +~====************====~+
  // +~====**'CREATE'**====~+
  // +~====************====~+

  // buildCreate=>
  buildCreate(queryObj, data) {
    if(/^\w+\=\>/.test(queryObj.name)) {
      return this.funcString(queryObj.name)
    }

    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    let insert = `INSERT INTO ${db}.${table}`;

    let {columns, values} = this.parseData(db, table, data);
    if(values.length === 0) {
      this.fatalError = true
      this.errors.push('There must be at least one value when creating a record.')
    }
    if(columns.length === 0) {
      this.fatalError = true
      this.errors.push('There must be at least one column when creating a record.')
    }
    let set = ` (${columns.map(c => c).join()}) VALUES (${values.map(v => v).join()})`;
    return `${insert}${set}`;
  }

  // +~====************====~+
  // +~====**'UPDATE'**====~+
  // +~====************====~+

  // buildUpdate=>
  buildUpdate(queryObj, data) {
    if(/^\w+\=\>/.test(queryObj.name)) {
      return this.funcString(queryObj.name)
    }

    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    let update = `UPDATE ${db}.${table}`;

    let {columns, values} = this.parseData(db, table, data);
    if(values.length === 0) {
      this.fatalError = true
      this.errors.push('There must be at least one value when creating a record.')
    }
    if(columns.length === 0) {
      this.fatalError = true
      this.errors.push('There must be at least one column when creating a record.')
    }
    let set = ` SET ${columns.map(( key, i ) => `${key} = ${values[i]}`).join()}`;

    if((queryObj.where || []).length === 0 || !queryObj.where) {
      this.fatalError = true;
      this.errors.push('No where condition provided. You cannot update all records in the table at once.');
    }

    let where = this.setWhString(queryObj, ' WHERE ');

    return `${update}${set}${where}`;
  }

  // +~====************====~+
  // +~====**'DELETE'**====~+
  // +~====************====~+

  // buildDelete=>
  buildDelete(queryObj) {
    if(/^\w+\=\>/.test(queryObj.name)) {
      return this.funcString(queryObj.name)
    }

    if(!queryObj.where) {
      this.fatalError = true;
      this.errors.push('No where string present. JSequel cannot delete all records in a single query.');
      return '';
    }

    const {db, table} = this.splitDbAndTableNames(queryObj.name);
    let del = `DELETE FROM ${db}.${table}`;


    let where = this.setWhString(queryObj, ' WHERE ');

    return `${del}${where}`;
  }


  // +~====********************====~+
  // +~====***'TREE MAPPING'***====~+
  // +~====********************====~+

  // buildTreeMap=>
  buildTreeMap(columns, callback) {

    let treeMap = []
    let tree = [0]
    let status = ''

    do {

      status = this.detectLeafStatus(columns, tree)

      if(status === 'not enough branches') tree.push(0)

      if(status === 'too many branches') tree.pop()
      
      if(status === 'no leaf') {
        tree.pop()
        tree[tree.length -1]++
      }

      if(status === 'found leaf') {
        treeMap.push([ ...tree ])
        tree[tree.length -1]++
      }

    } while (tree.length > 0)

    return callback ? callback(treeMap) : treeMap

  }

  // detectLeafStatus=>
  detectLeafStatus(columns, tree, index = 0) {

    if(tree[index+1] !== undefined) {

      if((columns[tree[index]] || {}).columns) {

        // console.log('columns so continue')
        // There's a columns item so go deeper
        return this.detectLeafStatus(columns[tree[index]].columns, tree, index+1)

      } else {
        // There's no columns item so this tree is incorrect.
        // console.log('too many branches')
        return 'too many branches'
      }

    } else if((columns[tree[index]] || {}).name) {

      if((columns[tree[index]] || {}).columns) {
        // console.log('not enough branches');
        return 'not enough branches'
      } 

      // console.log('found leaf')
      return 'found leaf'

    } else {
      // console.log('no leaf')
      return 'no leaf'
    }
  }

  // createSelectMapFromTree=>
  createSelectMapFromTree(columns, tree, index = 0, items = []) {

    const colIndex = tree[index]

    // We might need the dbTable value of the last item 
    // so we can check the schema inside nameRouter
    const prevDbTableName = items[index-1] ? items[index-1].dbTable : ''
    const col = this.nameRouter(columns[colIndex], prevDbTableName)

    if(!col) return null

    if(index === tree.length - 1) {

      items[index-1] = { ...items[index-1], name: col.name, as: col.as }

      return items
    }

    return this.createSelectMapFromTree(
      columns[colIndex].columns,
      tree,
      index+1,
      [ ...items, { dbTable: col.name, where: col.where, sort: col.sort, limit: col.limit } ]
    )
  }

  // +~====***********************====~+
  // +~====*****'NAME ROUTER'*****====~+
  // +~====***********************====~+

  // nameRouter=>
  nameRouter(col, dbTable) {

    const {
      db,
      table,
      as,
      sort,
      limit,
      where
    } = this.splitSelectItems(col, dbTable)

    // Has => so it's a function string
    if(/^\w+\=\>/.test(col.name)) {
      return { name: this.funcString(col.name), as }
    }

    // Has `$` at the start so it's a jQ string
    if(/^\$\w+/.test(col.name)) {
      return { name: this.jQExtract(db, table, col.name), as }
    }

    // Has name.name so it's a dbName selection
    if(/^\w+\.\w+$/g.test(col.name) && !col.as) {
      if(!col.where) {
        this.errors.push('There must be a where item for every db.table selection: ', col.name)
        this.fatalError = true
        return null
      }
      return { name: col.name, where, sort, limit }
    }

    // Has a dbTable and an `as` so it's to be made into a nested json
    if(/^\w+\.\w+$/g.test(col.name) && col.as) {
      return { name: this.parseNestedJson(col), as };
    }

    // Has a single name so it's a normal name selection
    if(/^\w+$/.test(col.name)) {

      if(!this.schema[db][table][col.name]) {
        this.errors.push(`${db}.${table}.${col.name} not found in schema`)
        this.fatalError = true
        return null
      }

      return { name: col.name, as }
    }

    this.errors.push('Column didn\'t meet the requirements for a selection: ', col)
    this.fatalError = true
    return null


    // Check to see if the column name is valid, we'll do this one
    // level up now because we'll have the dbName and name to check the
    // schema properly.
    // if(!this.columnValid(db, table, col.name)) {
    //   this.errors.push(`${db}.${table}.${col.name} not found in schema`);
    //   return null;
    // }

    // this.nestedAS = ` AS ${col.name}`;
    // return `${db}.${table}.${col.name}`;
  }

  // +~====*************====~+
  // +~====**'PARSERS'**====~+
  // +~====*************====~+

  // parseNestedJson=>
  parseNestedJson(queryObj) {
    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(queryObj.columns.length === 0) {
      this.errors.push(`No columns included at ${db}.${table}`);
      return null
    }

    let where = this.setWhString(queryObj, ' WHERE ');

    let sort = '';
    if(queryObj.sort && this.splitStringValidation(queryObj.sort)) {
      sort = ` ORDER BY ${queryObj.sort}`;
    }

    let limit = '';
    if(queryObj.limit) {
      limit = ` LIMIT ${queryObj.limit.map(l => l).join()}`;
    }

    let keyVals = [];
    queryObj.columns.forEach(col => {

      let { name } = this.nameRouter(col, db + '.' + table);
      if(!name) return null
      let key = col.as ? `'${col.as}'` : `'${col.name}'`;
      keyVals.push(`${key},${name}`);

    });

    return `(SELECT JSON_ARRAYAGG(JSON_OBJECT(${keyVals.join()})) FROM ${db}.${table}${where}${sort}${limit})`;
  }

  // +~====*************************====~+
  // +~====******'FUNCTIONS'********====~+
  // +~====*************************====~+

  // funcString=>
  funcString(name) {
    if(!this.plainStringValid(name)) return;
    const func = name.slice(0, name.indexOf('=>'))

    let args = name.slice(
      func.length + 2
    ).match(
      /\w+\=\>|\(|\)|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g
    );

    return this.convertFunc(func, args, 0);
  }

  // convertFunc=>
  convertFunc(func, args) {

    let newArgs = args;

    // Make an array of arrays of positions of all the arguments.
    // This starts from the first arg to the closing bracket.
    // We never capture the opening bracket.
    let argPositions = [];

    // In a loop keep flattening the arguments and re-calibrating
    // the argument positions until there's one big argument left.
    do {
      argPositions = this.getArgPositions(newArgs);
      newArgs = this.flattenArgs(newArgs, argPositions);
    } while (argPositions.length > 1);

    // If it's custom call it, if not return it with the name at the front
    // I'm doing toUpperCase here just to denote it's definitely a mysql function.
    let str = '';
    if(this.customFns[func]) {
      str = this.customFns[func](...newArgs);
    } else {
      str = `${func.toUpperCase()}(${newArgs.join()})`;
    }
    return str;
  }

  // getArgPositions=>
  getArgPositions(args) {
    let count = 0;
    let counts = [];
    let indexes = [];
    let types = [];

    args.forEach((arg,index) => {
      if(/^\($/.test(arg)) {
        if(types[types.length -1] !== 'close') count++;
        types.push('open');
        counts.push(count);
        indexes.push(index);
      }
      if(/^\)$/.test(arg)) {
        if(types[types.length -1] === 'close') count--;
        types.push('close');
        counts.push(count);
        indexes.push(index);
      }
    });

    return types.reduce((arr,type,i) => {

      if(type === 'close') {

        let endIndex = indexes[i];

        let currentCount = counts[i];
        let startCountIndex = counts.lastIndexOf(currentCount, i-1);

        let startIndex = indexes[startCountIndex]+1;

        return [...arr,  [startIndex, endIndex] ];

      }
      return arr;

    },[]);

  }

  // flattenArgs=>
  flattenArgs(newArgs, argPositions) {
    let start = argPositions[0][0];
    let end = argPositions[0][1];
    // start === end      < No arguments:  '()'               [ 7, 7 ]
    // end - start === 1  < One argument:  '("hi")'           [ 7, 8 ]
    // end - start === 2  < Two arguments: '("hi", CONCAT())' [ 7, 9 ]
    // etc...

    // If the start of the arguments is 1 then we're at
    // the outermost argument and just need to return the
    // whole thing.
    if(start === 1 && end !== 1) {
      return newArgs.slice(start, end);

    // if the start and end are both 1 there's no arguments.
    } else if(start === 1 && end === 1) {
      return [];
    }

    // If there's no arguments, for example [3, 3].
    // We can just flatten this arg 
    if(start === end) {
      return newArgs.reduce((arr,arg,i) => {

        if(/\w+\=\>/.test(arg) && i === start-2) {
          arg = arg.slice(0, -2);
          if(this.customFns[arg]) return [...arr, this.customFns[arg](...newArgs.slice(start, end))];
          return [...arr, arg.toUpperCase() + '(' + newArgs.slice(start, end).join() + ')'];
        }

        if(i === start - 1 || i === start) {
          return arr;
        }

        return [...arr, arg];

      },[]);
    }

    // if there's one argument, for example [ 8, 9 ].
    // if there's two arguments, for example [ 8, 10 ].
    // These are arguments that are definitely not unflattened functions
    // and can be flattened. 
    // if(end - start === 1 || end - start === 2) {
    if(end > start) {
      return newArgs.reduce((arr,arg,i) => {

        if(/\w+\=\>/.test(arg) && i === start-2) {
          arg = arg.slice(0, -2);
          if(this.customFns[arg]) return [...arr, this.customFns[arg](...newArgs.slice(start, end))];
          return [...arr, arg.toUpperCase() + '(' + newArgs.slice(start, end).join() + ')'];
        }

        if(i === start - 1 || (i >= start && i <= end)) {
          return arr;
        }

        return [...arr, arg];

      },[]);
    }

  }

  // +~====*************************====~+
  // +~====**'JSONQUERY FUNCTIONS'**====~+
  // +~====*************************====~+

  // extractColFromJQString=>
  extractColFromJQString(db, table, jQString) {
    let column = jQString.slice(1, jQString.search(/[\.\[]/));
    return column;
  }

  // jQExtract=>
  jQExtract(db, table, jQStr) {
    if(!this.plainStringValid(jQStr)) return;
    const regx = /(\$\w+)|(\[\d\])|(\.\w+)|(\[\?[\w\s@#:;{},.!"£$%^&*()/?|`¬\-=+~]*\])/g
    const matches = jQStr.match(regx);
    if(!this.columnValid(db, table, matches[0].slice(1))) return;
    const name = `${db}.${table}.${matches[0].slice(1)}`
    return `JSON_UNQUOTE(JSON_EXTRACT(${name}, ${this.jQStringMaker(name, matches)}))`;
  }

  // jQStringMaker=>
  jQStringMaker(name, matches) {
    let result = matches.reduce((arr, match, i) => {
      return [...arr, this.jQString(name, match, arr[i-1])];
    }, []);

    return result[result.length - 1];
  }

  // jQString=>
  jQString(name, string, prevString) {
    let nameReg = /\$\w+/;
    let index = /\[\d\]/;
    let target = /\.\w+/;
    let search = /\[\?[\w\s@#:;{},.!"£$%^&*()/?|`¬\-=+~]*\]/;

    if(nameReg.test(string)) {
      return `CONCAT("$")`;
    }
    if(index.test(string)) {
      // 'index';
      return `CONCAT(${prevString}, "${string}")`
    }
    if(target.test(string)) {
      // 'target';
      return `CONCAT(${prevString}, "${string}")`
    }
    if(search.test(string)) {
      // 'search';
      string = string.slice(2, -1);
      return `CONCAT(${prevString}, CONCAT('[',SUBSTR(JSON_SEARCH(JSON_EXTRACT(${name}, "$"),'one','${string}'), 4,LOCATE(']',JSON_SEARCH(JSON_EXTRACT(${name}, "$"), 'one', '${string}'))-4),']'))`;
    }
  }

  // jQSet=>
  jQSet(db, table, jQStr, value) {
    const regx = /(\$\w+)|(\[\d\])|(\.\w+)|(\[\?[\w\s@#:;{},.!"£$%^&*()/?|`¬\-=+~]*\])/g
    const matches = jQStr.match(regx);
    const name = `${db}.${table}.${matches[0].slice(1)}`
    return `JSON_SET(${name}, ${this.jQStringMaker(name, matches)}, ${value})`;
  }

  // +~====***************====~+
  // +~====**'UTILITIES'**====~+
  // +~====***************====~+

  // splitSelectItems=>
  splitSelectItems(col, dbTable) {
    const {db, table} = this.splitDbAndTableNames(dbTable)

    let name = ''
    if(col.name) name = col.name

    let as = ''
    if(col.as) as = col.as

    let sort = ''
    if(col.sort) sort = col.sort

    let limit = []
    if(col.limit) limit = col.limit

    let where = []
    if(col.where) where = col.where

    return {
      db,
      table,
      name,
      as,
      sort,
      limit,
      where
    }

  }

  // setWhString=>
  setWhString(queryObj, type) {
    let wheres = [];
    if((queryObj.where || []).length > 0) {
      queryObj.where.forEach(wh => {
        if(wh.length && typeof wh === 'object') {
          let ws = [];
          wh.forEach(w => !this.splitStringValidation(w) || ws.push(w))
          wheres.push(ws.join(' OR '));
          return;
        }
        if(!this.splitStringValidation(wh)) return;
        wheres.push(wh);
      });
    }

    return wheres.length > 0 ? (type || 'WHERE ') + wheres.join(' AND ') : '';
  }

  // splitDbAndTableNames=>
  splitDbAndTableNames(name) {
    const dbTable = /^\w+\.\w+$/
    if(!dbTable.test(name)) {
      return {}
    } else if(!this.dbTableValid(name)) {
      return {}
    }
    return {
      db: name.match(/^\w+|\w+$/g)[0],
      table: name.match(/^\w+|\w+$/g)[1]
    }
  }

  // +~====****************====~+
  // +~====**'VALIDATION'**====~+
  // +~====****************====~+

  // splitStringValidation=>
  splitStringValidation(whStr) {
    const parts = whStr.split(' ');
    // const parts = whStr.match(/[\$\w.]+|['`"].+['`"]|\\|\+|>=|<=|=>|>|<|-|\*|=/g);
    let valid = false;

    const dbTableColumn = /^\w+\.\w+\.\w+$/;
    const twoSelections = /^\w+\.\w+$/;
    const column = /^\w+$/;
    const string = /^['"`].+['"`]$/g;

    parts.forEach(part => {

      // if the part meets any of these conditions it will go to true
      if(this.plainStringValid(part)) {
        valid = true;
      }
      //
      // TODO: decide what you should do here this validation was causing more
      // problems than it fixed but it should probably be little more rigerous than it is now.
      //
      // if(dbTableColumn.test(part) && this.dbTableColumnValid(part, false)) {
      //   valid = true;
      // }
      // this.dbTableNames.forEach(dbTObj => {
      //   if(twoSelections.test(part) && this.tableColumnValid(dbTObj.db, part, false)) {
      //     valid = true;
      //   }
      //   if(column.test(part) && this.columnValid(dbTObj.db, dbTObj.table, part, false)) {
      //     valid = true;
      //   }
      // });
      if(!valid) {
        this.errors.push(part + ' didnt pass validation');
        this.fatalError = true;
      }
    });
    return valid;
  }

  // plainStringValid=>
  plainStringValid(string) {
    const regex = /(drop )|;|(update )|( truncate)/gi;
    if(regex.test(string)) {
      this.errors.push('The string \'' + string + '\' is not allowed');
      this.fatalError = true;
      return false;
    } else {
      return true;
    }
  }

  // +~====***********************====~+
  // +~====**'SCHEMA VALIDATION'**====~+
  // +~====***********************====~+

  // dbTableValid=>
  dbTableValid(string) {
    // We don't want to push an error here because this could be a valid table.column
    let m = string.match(/\w+/g);
    if(!(this.schema[m[0]] || {})[m[1]]) {
      return false
    }
    return true;
  }

  // dbTableColumnValid=>
  dbTableColumnValid(string, pushToErrors = true) {
    let m = string.match(/\w+/g);
    if(!((this.schema[m[0]] || {})[m[1]] || {})[m[2]]) {
      if(pushToErrors) this.errors.push(`${m[0]} ${m[1]} ${m[2]} not found in schema`);
      return false
    }
    return true;
  }

  // tableColumnValid=>
  tableColumnValid(db, string, pushToErrors = true) {
    let m = string.match(/\w+/g);
    if(!((this.schema[db] || {})[m[0]] || {})[m[1]]) {
      if(pushToErrors) this.errors.push(`${db} ${m[0]} ${m[1]} table or column not in schema`);
      return false
    }
    return true;
  }

  // columnValid=>
  columnValid(db, table, string, pushToErrors = true) {
    if(!((this.schema[db] || {})[table] || {})[string]) {
      if(pushToErrors) this.errors.push(`${db} ${table} ${string} column not in schema`);
      return false
    }
    return true;
  }
}
