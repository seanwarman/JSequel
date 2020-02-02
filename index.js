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
    this.validateQueryObject(queryObj);
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
    this.validateQueryObject(queryObj);
    data = this.removeDisallowedKeys(queryObj, data);
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
    this.validateQueryObject(queryObj);
    data = this.removeDisallowedKeys(queryObj, data);
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
    this.validateQueryObject(queryObj);
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

  // parseData=>
  parseData(db, table, data) {
    let values = [];
    let columns = [];
    Object.keys(data).forEach(key => {

      if(typeof data[key] === 'number') {
        columns.push(key);
        values.push(data[key]);
      } else if(typeof data[key] === 'string') {
        columns.push(key);
        values.push(`'${data[key]}'`);
      } else {
        return;
      }

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

    let select = `SELECT ${
      (queryObj.columns || []).length > 0 ? 
        queryObj.columns.map(col => {

          let name = this.setNameString(db, table, col);
          if(col.as) {
            name += ` AS ${col.as}`;
          }
          return name
        }).join() 
      : 
      ''
    }`;

    let from = ` FROM ${queryObj.name}`;

    // The outer parent object finds using a HAVING but the nested one's use WHERE.
    let where = (queryObj.where || []).length > 0 ? ` HAVING ${queryObj.where.map(wh => {
      if(wh.length && typeof wh === 'object') return wh.map(w => w).join(' OR ');
      return wh;
    }).join(' AND ')}` : '';

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

    let where = (queryObj.where || []).length > 0 ? ` WHERE ${queryObj.where.map(wh => {
      if(wh.length && typeof wh === 'object') return wh.map(w => w).join(' OR ');
      return wh;
    }).join(' AND ')}` : '';

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


    let where = (queryObj.where || []).length > 0 ? ` WHERE ${queryObj.where.map(wh => {
      if(wh.length && typeof wh === 'object') return wh.map(w => w).join(' OR ');
      return wh;
    }).join(' AND ')}` : '';

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
    return queryObj.columns.map(col => {

      let name = this.setNameString(db, table, col);
      // TODO: if you find the `as` logic not working properly
      // the problem could be here. I'm not sure whether to 
      // use col.name here or leave it blank.
      let as = ` AS ${col.name}`;
      if(col.as) {
        as = ` AS ${col.as}`;
      }

      let where = (queryObj.where || []).length > 0 ? ` WHERE ${queryObj.where.map(wh => {
        if(wh.length && typeof wh === 'object') return wh.map(w => w).join(' OR ');
        return wh;
      }).join(' AND ')}` : '';

      // The parent or the child objects can have a limit but the parent takes priority.
      let limit = queryObj.limit ? 
        ` LIMIT ${queryObj.limit.map(n => n).join()}` 
        : 
        col.limit ?
        ` LIMIT ${col.limit.map(n => n).join()}` 
        :
        '';

      return `(SELECT ${name} FROM ${queryObj.name}${where}${limit})${as}`;

    }).join();
  }

  // parseNestedJson=>
  parseNestedJson(queryObj) {
    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(queryObj.columns.length === 0) {
      this.errors.push(`No columns included at ${db}.${table}`);
      return '';
    }

    let where = ` WHERE ${queryObj.where}`;
    let limit = '';

    if(queryObj.limit) {
      limit = ` LIMIT ${queryObj.limit.map(l => l).join()}`;
    }

    let keyVals = queryObj.columns.map(col => {

      let name = this.setNameString(db, table, col);
      let key = col.as ? `'${col.as}'` : `'${col.name}'`;
      return `${key},${name}`;

    }).join();

    return `(SELECT JSON_ARRAYAGG(JSON_OBJECT(${keyVals})) FROM ${db}.${table}${where}${limit})`;
  }

  // +~====*************************====~+
  // +~====******'FUNCTIONS'********====~+
  // +~====*************************====~+

  // funcString=>
  funcString(name) {
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

  // jQExtract=>
  jQExtract(db, table, jQStr) {
    const regx = /(\$\w+)|(\[\d\])|(\.\w+)|(\[\?[\w\s@#:;{},.!"£$%^&*()/?|`¬\-=+~]*\])/g
    const matches = jQStr.match(regx);
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

  // +~====***************====~+
  // +~====**'UTILITIES'**====~+
  // +~====***************====~+

  // splitDbAndTableNames=>
  splitDbAndTableNames(name) {
    const dbTable = /^\w+\.\w+$/
    if(!dbTable.test(name)) {
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

  // removeDisallowedKeys=>
  removeDisallowedKeys(queryObj, data) {
    const {db,table} = this.splitDbAndTableNames(queryObj.name);
    if(!(this.schema[db] || {})[table]) {
      this.fatalError = true;
      this.errors.push(`${db}.${table} is not in the schema`);
      return;
    }

    let newData = {};

    Object.keys(data).forEach(key => {
      if(!this.schema[db][table][key]) {
        this.errors.push(`${db}.${table}.${key} is not in the schema`);
        this.fatalError = true;
        return;
      } else {
        newData[key] = data[key];
      }
    });

    return newData;

  }

  // validateQueryObject=>
  validateQueryObject(queryObj) {
    if(/^\w+\=\>/.test(queryObj.name)) {
      return true;
    }

    const {db,table} = this.splitDbAndTableNames(queryObj.name);
    this.dbTableNames.push({db, table});

    if(!(this.schema[db] || {})[table]) {
      this.fatalError = true;
      this.errors.push(`${db}.${table} is not in the schema`);
      return;
    }
    // We have to check the where first so it'll still have the relevent db and table names
    if(queryObj.where) {
      // Now to validate the where strings
      queryObj.where = queryObj.where.filter(wh => {
        if(this.whereStringValid(wh)) return true;
        return false;
      });
    }

    // Remove all invalid columns from the queryObject.
    queryObj.columns = (queryObj.columns || []).filter(col => {
      const twoSelections = /^\w+\.\w+$/;
      if(twoSelections.test(col.name) && this.dbTableValid(col.name)) {
        // Now check the nested object.
        this.validateQueryObject(col);
        return true;
      }
      if(col.as) {
        return this.nameStringValid(db, table, col.name) && this.plainStringValid(col.as);
      }
      return this.nameStringValid(db, table, col.name)
    });

    return queryObj;
  }

  // nameStringValid=>
  nameStringValid(db, table, name) {
    const dbTableColumn = /^\w+\.\w+\.\w+$/;
    const tableColumn = /^\w+\.\w+$/;
    const column = /^\w+$/;
    const string = /^['"`].+['"`]$/g;
    const func = /^\w+\=\>/;
    const all = /\*/g;
    const jQString = /^\$\w+/;

    if(typeof name === 'number') return true;

    if(jQString.test(name) && this.jQStringValid(db, table, name)) return true;
    if(all.test(name)) return true;
    if(func.test(name) && this.funcValid(db, table, name)) return true;
    if(string.test(name) && this.plainStringValid(name)) return true;
    if(dbTableColumn.test(name) && this.dbTableColumnValid(name)) return true;
    if(tableColumn.test(name) && this.tableColumnValid(db, name)) return true;
    if(column.test(name) && this.columnValid(db, table, name)) return true;
    return false;
  }

  // jQStringValid=>
  jQStringValid(db, table, jQString) {
    const column = jQString.slice(1, jQString.search(/[\.\[]/));
    if(!this.columnValid(db, table, column)) return false;
    return true;
  }

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

  // funcValid=>
  funcValid(db, table, name) {
    const func = name.slice(0, name.indexOf('=>'))
    let valid = false;
    // const columns = name.slice(func.length + 2).match(/\w+\=\>|[\(\)]|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g);
    // I've removed the () check from this regex because it was knocking a function with no args from the query.
    const columns = name.slice(func.length + 2).match(/\w+\=\>|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g);
    // No arguments return true.
    if(!columns) {
      return true; 
    }
    columns.forEach(nm => {
      if(this.nameStringValid(db, table, nm)){
        valid = true;
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
      if(pushToErrors) this.errors.push(`${m[0]} ${m[1]} ${m[2]} db, table or column not found in schema`);
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
