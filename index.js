module.exports = class JsonQL {
  constructor(schema) {
    this.schema = schema;
    this.errors = [];
    this.fatalError = false;

    this.select = ''
    this.from = '';
    this.where = '';

    this.dbTableNames = [];
  }

  // █▀▀ █▀▀█ █░░█ █▀▀▄   █▀▄▀█ █▀▀ ▀▀█▀▀ █░░█ █▀▀█ █▀▀▄ █▀▀
  // █░░ █▄▄▀ █░░█ █░░█   █░▀░█ █▀▀ ░░█░░ █▀▀█ █░░█ █░░█ ▀▀█
  // ▀▀▀ ▀░▀▀ ░▀▀▀ ▀▀▀░   ▀░░░▀ ▀▀▀ ░░▀░░ ▀░░▀ ▀▀▀▀ ▀▀▀░ ▀▀▀

  selectQL(queryObj) {

    this.validateQueryObject(queryObj);
    let query = this.parseQueryObj(queryObj);

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
  create(queryObj) {
    this.parseQueryObj(queryObj);
  }
  update(queryObj) {
    this.parseQueryObj(queryObj);
  }
  delete(queryObj) {
    this.parseQueryObj(queryObj);
  }
  // █▀▀█ █▀▀█ █▀▀█ █▀▀ █▀▀ █▀▀█ █▀▀
  // █░░█ █▄▄█ █▄▄▀ ▀▀█ █▀▀ █▄▄▀ ▀▀█
  // █▀▀▀ ▀░░▀ ▀░▀▀ ▀▀▀ ▀▀▀ ▀░▀▀ ▀▀▀

  parseQueryObj(queryObj) {
    const {db, table} = this.parseDbAndTableNames(queryObj.name);

    let select = `SELECT ${
      queryObj.columns.length > 0 ? 
        queryObj.columns.map(col => {

          // If this name is a database selection we'll want to nest the new select inside the old one.
          if(/^\w+\.\w+$/g.test(col.name)) return this.parseNestedQueryObj(col);

          let name = this.setNameString(db, table, col.name);
          if(col.as) {
            name += ` AS ${col.as}`;
          }
          return name
        }).join() 
      : 
      ''
    }`;

    let from = ` FROM ${queryObj.name}`

    let where = (queryObj.where || []).length > 0 ? ` WHERE ${queryObj.where.map(wh => {
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

  parseNestedQueryObj(queryObj) {
    const {db, table} = this.parseDbAndTableNames(queryObj.name);

    if(queryObj.columns.length === 0) {
      this.errors.push(`No columns included at ${db}.${table}`);
      return '';
    }
    return queryObj.columns.map(col => {

      if(/^\w+\.\w+$/g.test(col.name)) return this.parseNestedQueryObj(col);

      let name = this.setNameString(db, table, col.name);
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

  // █▀▀ ▀▀█▀▀ █▀▀█ ░▀░ █▀▀▄ █▀▀▀ █▀▀
  // ▀▀█ ░░█░░ █▄▄▀ ▀█▀ █░░█ █░▀█ ▀▀█
  // ▀▀▀ ░░▀░░ ▀░▀▀ ▀▀▀ ▀░░▀ ▀▀▀▀ ▀▀▀

  setNameString(db, table, name) {

    if(/^\w+\=\>/.test(name)) {
      return this.funcString(db, table, name);
    }
    if(/^\$\w+/.test(name)) {
      return this.jQExtract(db, table, name);
    }

    return `${db}.${table}.${name}`;
  }

  funcString(db, table, name) {
    const func = name.slice(0, name.indexOf('=>'))

    let columns = name.slice(
      func.length + 2
    ).match(
      /\w+\=\>|[\(\)]|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g
    );

    let args = (columns || []).reduce((str, arg) => {

      // TODO: we want to send the arguments down with convertFnString so that we can
      // use them if we want to convert any of these into custom functions.

      if(/^\w+\=\>/.test(arg)) return str + this.convertFnString(arg);
      if(/\(/.test(arg)) return str + arg;
      if(/\)/.test(arg) && /\,$/.test(str)) return str.slice(0,-1) + arg + ','; 
      return str + arg + ',';

    }, '').slice(0,-1);

    console.log('args: ', args);

    return `${func}${args}`;
  }

  // ░░▀ █▀▀█ █▀▀ ▀▀█▀▀ █▀▀█ ░▀░ █▀▀▄ █▀▀▀ █▀▀
  // ░░█ █░░█ ▀▀█ ░░█░░ █▄▄▀ ▀█▀ █░░█ █░▀█ ▀▀█
  // █▄█ ▀▀▀█ ▀▀▀ ░░▀░░ ▀░▀▀ ▀▀▀ ▀░░▀ ▀▀▀▀ ▀▀▀

  jQExtract(db, table, jQStr) {
    const regx = /(\$\w+)|(\[\d\])|(\.\w+)|(\[\?[\w\s@#:;{},.!"£$%^&*()/?|`¬\-=+~]*\])/g
    const matches = jQStr.match(regx);
    const name = `${db}.${table}.${matches[0].slice(1)}`
    return `JSON_UNQUOTE(JSON_EXTRACT(${name}, ${this.jQStringMaker(name, matches)}))`;
  }

  jQStringMaker(name, matches) {
    let result = matches.reduce((arr, match, i) => {
      return [...arr, this.jQString(name, match, arr[i-1])];
    }, []);

    return result[result.length - 1];
  }

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

  // █░░█ ▀▀█▀▀ ░▀░ █░░ ░▀░ ▀▀█▀▀ ░▀░ █▀▀ █▀▀
  // █░░█ ░░█░░ ▀█▀ █░░ ▀█▀ ░░█░░ ▀█▀ █▀▀ ▀▀█
  // ░▀▀▀ ░░▀░░ ▀▀▀ ▀▀▀ ▀▀▀ ░░▀░░ ▀▀▀ ▀▀▀ ▀▀▀

  convertFnString(fnName) {
    return fnName.slice(0, -2).toUpperCase();
  }

  parseDbAndTableNames(name) {
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

  // ▀█░█▀ █▀▀█ █░░ ░▀░ █▀▀▄ █▀▀█ ▀▀█▀▀ ░▀░ █▀▀█ █▀▀▄
  // ░█▄█░ █▄▄█ █░░ ▀█▀ █░░█ █▄▄█ ░░█░░ ▀█▀ █░░█ █░░█
  // ░░▀░░ ▀░░▀ ▀▀▀ ▀▀▀ ▀▀▀░ ▀░░▀ ░░▀░░ ▀▀▀ ▀▀▀▀ ▀░░▀

  validateQueryObject(queryObj) {
    const {db,table} = this.parseDbAndTableNames(queryObj.name);
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
    queryObj.columns = queryObj.columns.filter(col => {
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

  jQStringValid(db, table, jQString) {
    const column = jQString.slice(1, jQString.search(/[\.\[]/));
    if(!this.columnValid(db, table, column)) return false;
    return true;
  }

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

  funcValid(db, table, name) {
    const func = name.slice(0, name.indexOf('=>'))
    let valid = false;
    const columns = name.slice(func.length + 2).match(/\w+\=\>|[\(\)]|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g);
    // No arguments return true.
    if(!columns) return true; 
    columns.forEach(nm => {
      if(this.nameStringValid(db, table, nm)){
        valid = true;
      }
    });
    return valid;
  }

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

  // █▀▀ █▀▀ █░░█ █▀▀ █▀▄▀█ █▀▀█   ▀█░█▀ █▀▀█ █░░ ░▀░ █▀▀▄ █▀▀█ ▀▀█▀▀ ░▀░ █▀▀█ █▀▀▄
  // ▀▀█ █░░ █▀▀█ █▀▀ █░▀░█ █▄▄█   ░█▄█░ █▄▄█ █░░ ▀█▀ █░░█ █▄▄█ ░░█░░ ▀█▀ █░░█ █░░█
  // ▀▀▀ ▀▀▀ ▀░░▀ ▀▀▀ ▀░░░▀ ▀░░▀   ░░▀░░ ▀░░▀ ▀▀▀ ▀▀▀ ▀▀▀░ ▀░░▀ ░░▀░░ ▀▀▀ ▀▀▀▀ ▀░░▀

  dbTableValid(string) {
    // We don't want to push an error here because this could be a valid table.column
    let m = string.match(/\w+/g);
    if(!(this.schema[m[0]] || {})[m[1]]) {
      return false
    }
    return true;
  }

  dbTableColumnValid(string, pushToErrors = true) {
    let m = string.match(/\w+/g);
    if(!((this.schema[m[0]] || {})[m[1]] || {})[m[2]]) {
      if(pushToErrors) this.errors.push(`${m[0]} ${m[1]} ${m[2]} db, table or column not found in schema`);
      return false
    }
    return true;
  }

  tableColumnValid(db, string, pushToErrors = true) {
    let m = string.match(/\w+/g);
    if(!((this.schema[db] || {})[m[0]] || {})[m[1]]) {
      if(pushToErrors) this.errors.push(`${db} ${m[0]} ${m[1]} table or column not in schema`);
      return false
    }
    return true;
  }

  columnValid(db, table, string, pushToErrors = true) {
    if(!((this.schema[db] || {})[table] || {})[string]) {
      if(pushToErrors) this.errors.push(`${db} ${table} ${string} column not in schema`);
      return false
    }
    return true;
  }
}
