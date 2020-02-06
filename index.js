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
    let query = this.buildSelect(queryObj);

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
    if(typeof value === 'object' && value.forEach) {
      return `JSON_ARRAY(${value.map(val => this.setValueString(val)).join()})`;
    }
    if(typeof value === 'object' && !value.forEach) {
      return `JSON_OBJECT(${Object.keys(value).map(key => `${this.setValueString(key)}, ${this.setValueString(value[key])}`).join()})`;
    }
    if(typeof value === 'number') {
      return `${value}`;
    }
    if(typeof value === 'string') {
      return `"${value}"`;
    }
  }

  // setJQString=>
  setJQString(db, table, key, value) {
    let column = this.extractColFromJQString(db, table, key);
    column = `${db}.${table}.${column}`;

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
        col = jqObj.column;
        val = jqObj.value;
      } else {
        val = this.setValueString(data[key]);
        col = key;
      }
      if(!this.columnValid(db, table, col)) return;
      if(!this.plainStringValid(val)) return;
      columns.push(col);
      values.push(val);
    });
    return {columns, values}
  }

  // +~====************====~+
  // +~====**'SELECT'**====~+
  // +~====************====~+

  // buildSelect=>
  buildSelect(queryObj) {
    if(/^\w+\=\>/.test(queryObj.name)) {
      return this.funcString(queryObj.name)
    }

    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    let columns = [];
    if((queryObj.columns || []).length > 0) {
      queryObj.columns.forEach(col => {

        let name = this.setNameString(db, table, col);
        if(!name) {
          return;
        }

        if(col.as) {
          name += ` AS ${col.as}`;
        }
        columns.push(name);
      });
    } else {
      this.errors.push('A Jseq select must have at least one column defined');
      this.fatalError = true;
    }

    let select = `SELECT ${columns.join()}`;

    let from = ` FROM ${queryObj.name}`;

    // The outer parent object finds using a HAVING but the nested one's use WHERE.
    let where = this.setWhString(queryObj, ' HAVING ');

    let limit = queryObj.limit ? ` LIMIT ${queryObj.limit.map(n => n).join()}` : '';

    let as = '';
    if(queryObj.as) {
      as += ` AS ${queryObj.as}`;
    }
    return `(${select}${from}${where}${limit})${as}`;
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

  // +~====**********************====~+
  // +~====**'NAME SELECTIONS'***====~+
  // +~====**********************====~+

  // setNameString=>
  setNameString(db, table, col) {

    if(/^\w+\.\w+$/g.test(col.name) && col.as) {
      return this.parseNestedJson(col);
    }

    if(/^\w+\.\w+$/g.test(col.name)) {
      return this.parseNestedSelect(col);
    }

    if(/^\w+\=\>/.test(col.name)) {
      return this.funcString(col.name);
    }

    if(/^\$\w+/.test(col.name)) {
      return this.jQExtract(db, table, col.name);
    }

    if(!this.columnValid(db, table, col.name)) {
      this.errors.push(`${db}.${table}.${col.name} not found in schema`);
      return null;
    }
    this.nestedAS = ` AS ${col.name}`;
    return `${db}.${table}.${col.name}`;
  }

  // +~====*************====~+
  // +~====**'PARSERS'**====~+
  // +~====*************====~+

  // parseNestedSelect=>
  parseNestedSelect(queryObj) {
    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(queryObj.columns.length === 0) {
      this.errors.push(`No columns included at ${db}.${table}`);
      return '';
    }
    let columns = [];
    queryObj.columns.forEach(col => {

      let name = this.setNameString(db, table, col);
      if(!name) return;

      let as = this.nestedAS;
      if(col.as) {
        as = ` AS ${col.as}`;
      }

      const where = this.setWhString(queryObj, ' WHERE ');

      // The parent or the child objects can have a limit but the parent takes priority.
      let limit = queryObj.limit ? 
        ` LIMIT ${queryObj.limit.map(n => n).join()}` 
        : 
        col.limit ?
        ` LIMIT ${col.limit.map(n => n).join()}` 
        :
        '';

      columns.push(`(SELECT ${name} FROM ${queryObj.name}${where}${limit})${as}`);

    });
    return columns.join();
  }

  // parseNestedJson=>
  parseNestedJson(queryObj) {
    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(queryObj.columns.length === 0) {
      this.errors.push(`No columns included at ${db}.${table}`);
      return '';
    }

    let where = this.setWhString(queryObj, ' WHERE ');
    let limit = '';

    if(queryObj.limit) {
      limit = ` LIMIT ${queryObj.limit.map(l => l).join()}`;
    }

    let keyVals = [];
    queryObj.columns.forEach(col => {

      let name = this.setNameString(db, table, col);
      if(!name) return;
      let key = col.as ? `'${col.as}'` : `'${col.name}'`;
      keyVals.push(`${key},${name}`);

    });

    return `(SELECT JSON_ARRAYAGG(JSON_OBJECT(${keyVals.join()})) FROM ${db}.${table}${where}${limit})`;
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
      str = this.customFns[func](newArgs);
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
          if(this.customFns[arg]) return [...arr, this.customFns[arg](newArgs.slice(start, end))];
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
          if(this.customFns[arg]) return [...arr, this.customFns[arg](newArgs.slice(start, end))];
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
    if(!this.plainStringValid(jQString)) return;
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

  // setWhString=>
  setWhString(queryObj, type) {
    let wheres = [];
    if((queryObj.where || []).length > 0) {
      queryObj.where.forEach(wh => {
        if(wh.length && typeof wh === 'object') {
          let ws = [];
          wh.forEach(w => !this.whereStringValid(w) || ws.push(w))
          wheres.push(ws.join(' OR '));
          return;
        }
        if(!this.whereStringValid(wh)) return;
        wheres.push(wh);
      });
    }

    return wheres.length > 0 ? (type || 'WHERE ') + wheres.join(' AND ') : '';
  }

  // splitDbAndTableNames=>
  splitDbAndTableNames(name) {
    const dbTable = /^\w+\.\w+$/
    if(!dbTable.test(name)) {
      this.errors.push('This name is not allowed: ' + name);
      this.fatalError = true;
      return null;
    } else if(!this.dbTableValid(name)) {
      this.errors.push('This db and table are not in the schema: ' + name);
      this.fatalError = true;
      return null;
    }
    return {
      db: name.match(/^\w+|\w+$/g)[0],
      table: name.match(/^\w+|\w+$/g)[1]
    }
  }

  // +~====****************====~+
  // +~====**'VALIDATION'**====~+
  // +~====****************====~+

  // whereStringValid=>
  whereStringValid(whStr) {
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
