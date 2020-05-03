module.exports = class JsonQL {
  // constructor=>
  constructor(schema) {

    if(!schema) throw Error('Jseq always requires a schema object.')

    this.schema = schema;
    this.errors = [];
    this.fatalError = false;

    this.select = '';
    this.from = '';
    this.where = '';

    this.masterDbTable = '';
    this.customFns = {};
    this.customObj = {};
    this.nestedAS = '';
    this.nestedAsNames = [];
  }

  // addCustomFns=>
  addCustomFns(customFns, customObj) {
    this.customFns = customFns;
    this.customObj = customObj;
  }

  // +~====***************====~+
  // +~====**ENTRYPOINTS**====~+
  // +~====***************====~+

  async createFromSchema(oldSchema) {


//       SELECT

//       TABLE_NAME AS tableName,
//       COLUMN_NAME AS colName,
//       DATA_TYPE AS type,
//       CHARACTER_MAXIMUM_LENGTH AS maxLength
//       EXTRA AS extra

//       FROM INFORMATION_SCHEMA.COLUMNS
//       WHERE table_schema = '${dbName}'


    let query = await this.buildSchemaQuery(oldSchema)

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query
      }
    }

    return {
      status: 'success',
      errors: this.errors,
      query
    }

  }


  // selectSQ=>
  selectSQ(queryObj) {
    let query = ''
    let treeMap = []

    // If the `name` has a custom function return that only.
    if(/^\w+\=\>/.test(queryObj.name)) {

      query = this.funcString(queryObj.name)

    } else {

      treeMap = this.buildTreeMap(queryObj.columns)
      query = this.buildSelect(queryObj, treeMap);

    }

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query
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
    let query = ''

    if(/^\w+\=\>/.test(queryObj.name)) {

      query = this.funcString(queryObj.name, data)

    } else {

      query = this.buildCreate(queryObj, data);

    }


    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query
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
    let query = ''

    if(/^\w+\=\>/.test(queryObj.name)) {

      query = this.funcString(queryObj.name, data)

    } else {

      query = this.buildUpdate(queryObj, data);
    }

    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query
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
    let query = ''

    if(/^\w+\=\>/.test(queryObj.name)) {

      query = this.funcString(queryObj.name)

    } else {

      query = this.buildDelete(queryObj);
    }


    if(this.fatalError) {
      return {
        status: 'error',
        errors: this.errors,
        query
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
  // +~====**'SCHEMA'**====~+
  // +~====************====~+

  async buildSchemaQuery(fetchSchema) {

    let oldSchema = await fetchSchema(`

      SELECT

      TABLE_NAME AS tableName,
      COLUMN_NAME AS colName,
      DATA_TYPE AS type,
      CHARACTER_MAXIMUM_LENGTH AS maxLength,
      EXTRA AS extra

      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE table_schema = '${Object.keys(this.schema)[0]}'

    `)

    let query = []

    // There'll be a query for every table item, then every 
    // column. That way if it errors out it won't matter.
    //
    // Currently if anything about a column changes from
    // how it was set before it will over-write the old column
    // including any records it had.

    // Make our jseq schema look the same as the schema that
    // mysql returns...
    let newSchema = this.formatJseqSchema()

    // Get rid of the id colName items, this is managed by mysql
    // automatically and will fail to delete if it's the last 
    // column name left.
    oldSchema = oldSchema.filter(item => item.colName !== 'id')

    // The new schema shouldn't have id columns but in case
    // it does, just filter them out.
    newSchema = newSchema.filter(item => {
      if(item.colName === 'id') {
        this.errors.push('The column name "id" is reserved and has been removed from the schema query.')
        return false
      }
      return true

    })



    // Make a simple array for new tables
    const newTables = newSchema.reduce((arr, item) => {
      if(arr.includes(item.tableName)) return arr

      // Mysql doesn't really like table names with capitals so
      // error out if you find any.
      if(/[A-Z]/g.test(item.tableName)) {
        this.fatalError = true
        this.errors.push('Table names must contain lower-case letters only.')
        return false
      }

      return [...arr, item.tableName]
    }, [])

    // Make a simple array for old tables
    const oldTables = oldSchema.reduce((arr, item) => {
      if(arr.includes(item.tableName)) return arr
      else return [...arr, item.tableName]
    }, [])


    // If the item exists in new but not in old,
    // we have to make a create table query for it.
    //
    // We do this first so that any new columns we
    // create have a table to go to.
    const createTables = newTables.reduce((arr, tableName) => {
      if(oldTables.includes(tableName)) return arr
      else return [ ...arr, this.createTable(tableName) ]
    },[])



    // Then we delete any columns from the old schema
    // that don't 100% match the columns in the new schema.
    const removeColumns = oldSchema.reduce((arr, item) => {

      const newItem = newSchema.find(newItem => 
        newItem.tableName === item.tableName &&
        newItem.colName   === item.colName   &&
        newItem.type      === item.type      &&
        // The mysql schema doesn't return a maxLength for ints so if this is
        // an int just ignore maxLength and return true
        (newItem.type !== 'int' ? (newItem.maxLength === item.maxLength) : true) 
      )

      if(!newItem) return [ ...arr, this.deleteColumn(item)]

      return arr


    },[])


    // Next create any columns in the new schema that
    // don't 100% match columns in the old schema
    const createColumns = newSchema.reduce((arr, item) => {

      const oldItem = oldSchema.find(oldItem => {

        return (
          oldItem.tableName === item.tableName &&
          oldItem.colName   === item.colName   &&
          oldItem.type      === item.type      &&
          // The mysql schema doesn't return a maxLength for ints so if this is
          // an int just ignore maxLength and return true
          (oldItem.type !== 'int' ? (oldItem.maxLength === item.maxLength) : true) 
        )
      })

      if(!oldItem) return [ ...arr, this.createColumn(item)]

      return arr

    },[])
    



    // If the item exists in old but not it new
    // we have to make a delete for it.
    const deleteTables = oldTables.reduce((arr, tableName) => {
      if(newTables.includes(tableName)) return arr
      else return [ ...arr, this.delTable(tableName) ]
    },[])


    query = [
      ...createTables,
      ...removeColumns,
      ...createColumns,
      ...deleteTables,
    ]


    return query

  }

  deleteColumn(item) {
    return `DELETE \`${item.colName}\` FROM \`${item.tableName}\``
  }

  createColumn(item) {
    return `ALTER TABLE \`${item.tableName}\` ADD COLUMN \`${item.colName}\` ${ item.type === 'timestamp' ? item.type : `${item.type}(${item.maxLength})` }`
  }

  delTable(tableName) {
    return `DROP TABLE \`${tableName}\``
  }

  createTable(tableName) {
    return `CREATE TABLE \`${tableName}\` (\`id\` int(11) unsigned NOT NULL AUTO_INCREMENT, PRIMARY KEY (\`id\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `
  }

  convertTypeToJseq(type) {
    if(type === 'varchar') return 'string'
    if(type === 'int') return 'number'
    if(type === 'timestamp') return 'date'
    return 'string'
  }

  convertTypeToSQL(type) {
    if(type === 'string') return 'varchar'
    if(type === 'number') return 'int'
    if(type === 'date') return 'timestamp'
    return 'varchar'

  }

  formatJseqSchema() {
    // Get the dbName for clarity...
    const dbName = Object.keys(this.schema)[0]

    // Select it, we're only working on one db
    // at a time...
    const schemaDb = this.schema[dbName]

    return Object.keys(schemaDb).reduce((arr, table) => {

      return [...arr, ...Object.keys(schemaDb[table]).map(col => {
        return {
          tableName: table,
          colName: col,
          type: this.convertTypeToSQL((schemaDb[table][col] || {}).type),
          maxLength: 
          (schemaDb[table][col] || {}).type === 'date' ?
          null
          :
          (schemaDb[table][col] || {}).type === 'number' ?
          ((schemaDb[table][col] || {}).maxLength || 11)
          :
          ((schemaDb[table][col] || {}).maxLength || 200)
        }
      })]

    }, [])
  }

  // +~====************====~+
  // +~====**'SELECT'**====~+
  // +~====************====~+

  // buildSelect=>
  buildSelect(queryObj, treeMap) {

    let {
      db,
      table,
      sort,
      limit,
      where,
      having,
      group
    } = this.splitSelectItems(queryObj, queryObj.name)

    // This comes in handy.
    this.masterDbTable = `${db}.${table}`

    if(where.length > 0) where = ` WHERE ${where.join(' AND ')}`
    if(group.length > 0) group = ` GROUP BY ${group.join()}`
    if(having.length > 0) having = ` HAVING ${having.join(' AND ')}`
    if(sort.length > 0) sort = ` ORDER BY ${sort}`
    if(limit.length > 0) limit = ` LIMIT ${limit.join()}`


    // treeMap is an array of indexes showing us where everything
    // is in queryObj.columns.

    const columns = treeMap.reduce((array, tree, i) => {

      // We want to make an array of all the different column selections for
      // our query. SQL will only let you select a single column in a nested
      // query so we have to start at the top and work our way down for each one.
      const column = this.buildColumnsFromTree(queryObj.columns, tree)

      // buildColumnsFromTree returns null if there's an error with the 
      // column so miss this one out if that's the case...
      if(!column) return array

      return [ ...array, `${column}${this.nestedAsNames[i]}` ]

    }, [])


    // Finally put all the columns into a master selection and return the result.
    return `SELECT ${columns.join()} FROM ${db}.${table}${where}${group}${having}${sort}${limit}`



  }

  // buildColumnsFromTree=>
  buildColumnsFromTree(columns, tree, index = 0, prevDbTable = this.masterDbTable) {

    const col = columns[tree[index]]

    let name = ''
    if(col.name) name = col.name

    let as = ''
    if(col.as) as = ` AS ${col.as}`

    let sort = ''
    if(col.sort) sort = ` ORDER BY ${col.sort}`

    let limit = ''
    if(col.limit) limit = ` LIMIT ${col.limit.join()}`

    let where = ''
    if(col.where) where = ` WHERE ${col.where.join(' AND ')}`

    let group = ''
    if(col.group) group = ` GROUP BY ${group.join()}`


    // If we're at the last tree return the name and add an as to the
    // top level.
    if(tree[index+1] === undefined || as.length > 0) {


      // We often need the as name at the top level, outside of the nested
      // selects so we store it here. If there's no as in the cols object
      // we still want it otherwise mysql will give us the long selection
      // as a key name in our result.
      this.nestedAsNames.push(as.length > 0 ? as : ` AS ${name}`)

      // At the final step the nameRouter function converts any fancy names 
      // into a boring old sql string.
      return this.nameRouter(col, prevDbTable)
    }

    // The other option is we keep digging...
    return `(SELECT ${this.buildColumnsFromTree(col.columns, tree, index+1, col.name)} FROM ${name}${where}${group}${limit}${sort})`

  }

  // +~====************====~+
  // +~====**'CREATE'**====~+
  // +~====************====~+

  // buildCreate=>
  buildCreate(queryObj, data) {

    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(!(this.schema[db] || {})[table]) {
      this.errors.push(`${db}.${table} not found in schema`)
      this.fatalError = true
    }

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

    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(!(this.schema[db] || {})[table]) {
      this.errors.push(`${db}.${table} not found in schema`)
      this.fatalError = true
    }

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
    if(!queryObj.where) {
      this.fatalError = true;
      this.errors.push('No where string present. JSequel cannot delete all records in a single query.');
      return '';
    }

    const {db, table} = this.splitDbAndTableNames(queryObj.name);

    if(!(this.schema[db] || {})[table]) {
      this.errors.push(`${db}.${table} not found in schema`)
      this.fatalError = true
    }

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

      // If there's an 'as' we'll stop prematurely because
      // this is a nested json selection.
      if(
        (columns[tree[index]] || {}).columns &&
        (columns[tree[index]] || {}).as
      ) return 'found leaf'

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

  // +~====***********************====~+
  // +~====*****'NAME ROUTER'*****====~+
  // +~====***********************====~+

  // nameRouter=>
  nameRouter(col, dbTable = this.masterDbTable) {

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
      if(!col.as) {
        this.errors.push('There must be an "as" value for every function selection: ', col.name)
        // this.fatalError = true
        return null
      }
      return this.funcString(col.name)
    }

    // Has `$` at the start so it's a jQ string
    if(/^\$\w+/.test(col.name)) {
      if(!col.as) {
        this.errors.push('There must be an "as" value for every jQString selection: ', col.name)
        // this.fatalError = true
        return null
      }
      return this.jQExtract(db, table, col.name)
    }

    // Has name.name so it's a dbName selection
    if(/^\w+\.\w+$/g.test(col.name) && !col.as) {
      if(!col.where) {
        this.errors.push('There must be a "where" value for every db.table selection: ', col.name)
        // this.fatalError = true
        return null
      }
      return col.name
    }

    // Has a dbTable and an `as` so it's to be made into a nested json
    if(/^\w+\.\w+$/g.test(col.name) && col.as) {
      return this.parseNestedJson(col)
    }

    // Has a single name so it's a normal name selection
    if(/^\w+$/.test(col.name)) {

      if(!((this.schema[db] || {})[table] || {})[col.name]) {
        this.errors.push(`${db}.${table}.${col.name} not found in schema`)
        if(db === undefined || table === undefined) this.fatalError = true
        return null
      }

      return col.name
    }

    this.errors.push('Column didn\'t meet the requirements for a selection: ', JSON.stringify(col))
    // this.fatalError = true
    return null

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

      let name = this.nameRouter(col, db + '.' + table);
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
  funcString(name, data) {
    if(!this.plainStringValid(name)) return;
    const func = name.slice(0, name.indexOf('=>'))

    let args = name.slice(
      func.length + 2
    ).match(
      /[`'"][\[{].*[}\]]['`"]|\w+\=\>|\(|\)|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g
    );


    return this.convertFunc(func, args, data);
  }

  // convertFunc=>
  convertFunc(func, args, data) {

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

      // Add the data here as well, if this is an update or
      // create it gives the user access to it in the custom function.
      str = this.customFns[func](...newArgs, data);

    } else {
      str = `${func.toUpperCase()}(${newArgs.map(arg => {
        if(/^"\$\w+/.test(arg)) {
          return this.jQExtractNoTable(arg.slice(1, arg.length - 1))
        }
        return arg

      }).join()})`;
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

  parseCustomObj(arr, arg) {

    // Grab all the selections in an array: '@.thing' = ['@', 'thing']
    let customObj = {}
    const selections = arg.slice(1,-1).split('.')

    // Turn arg into the object being selected.
    selections.forEach((sel, i) => {
      if(i === 0) customObj = this.customObj
      else customObj = customObj[sel]
    })

    return [...arr, customObj];
  }

  parseCustomFunc(arr, arg) {
    arg = arg.slice(0, -2);
    if(this.customFns[arg]) return [...arr, this.customFns[arg](...newArgs.slice(start, end))];
    return [...arr, arg.toUpperCase() + '(' + newArgs.slice(start, end).join() + ')'];
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

      newArgs = newArgs.slice(start, end).map(arg => { 

        if(/\w+\=\>/.test(arg)) {
          arg = arg.slice(0, -2);
          if(this.customFns[arg]) return this.customFns[arg]();
          return arg.toUpperCase() + '()';
        }


        if(/^"@/.test(arg) && this.customObj) {

          // Grab all the selections in an array: '@.thing' = ['@', 'thing']
          let customObj = {}
          const selections = arg.slice(1,-1).split('.')

          // Turn arg into the object being selected.
          selections.forEach((sel, i) => {
            if(i === 0) customObj = this.customObj
            else customObj = customObj[sel]
          })

          return customObj
        }



        return arg;

      })

      return newArgs


    // if the start and end are both 1 there's no arguments at all.
    } else if(start === 1 && end === 1) {

      return [];
    }

    // If there's no arguments, for example [3, 3].
    // We can just flatten this arg 
    if(start === end) {

      return newArgs.reduce((arr,arg,i) => {

        if(/\w+\=\>/.test(arg) && i === start-2) {

          return this.parseCustomFunc(arr,arg) 
        }

        // If this argument is a custom object selection: '@.thing'
        // And there's a customObj on this.
        if(/^"@/.test(arg) && i === start-2 && this.customObj) {

          return this.parseCustomObj(arr, arg)
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

          return this.parseCustomFunc(arr,arg) 
        }

        // If this argument is a custom object selection: '@.thing'
        // And there's a customObj on this.
        if(/^"@/.test(arg) && i === start-2 && this.customObj) {

          return this.parseCustomObj(arr, arg)
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

  // jQExtractNoTable=>
  jQExtractNoTable(jQStr) {
    if(!this.plainStringValid(jQStr)) return;
    const regx = /(\$\w+)|(\[\d\])|(\.\w+)|(\[\?[\w\s@#:;{},.!"£$%^&*()/?|`¬\-=+~]*\])/g
    const matches = jQStr.match(regx);
    const name = `${matches[0].slice(1)}`
    return `JSON_UNQUOTE(JSON_EXTRACT(${name}, ${this.jQStringMaker(name, matches)}))`;
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

    let having = []
    if(col.having) having = col.having

    let group = []
    if(col.group) group = col.group

    return {
      db,
      table,
      name,
      as,
      sort,
      limit,
      where,
      having,
      group
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
