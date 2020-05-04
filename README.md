# JSequel
A small framework for controlling your API endpoints from the frontend. Much
like GraphQL but lighter and less obtrusive to your already complicated
stack. 

All **JSequel** does is make mysql query strings so it's also fast.

## Warning

**Jsequel** is still in development phase and so is not yet production ready.

## Explanation

If you've built an API using the [Serverless Framework](https://serverless.com/), AWS Lambda functions
or any manage any other kind of serverless backend you'll know that updating development code is long-
winded and very hard to debug.

Lots of devs have turned to [GraphQL](https://graphql.org/) for this very reason but for
my particular needs I thought GraphQL was a bit overkill.

**JSequel** is light and fast because all it does is build mysql query strings. This means 
it can easily be added to your project without disrupting whatever structure you've already built.

You don't have to install any frontend framework and it essentially runs from a single object and a 
schema that you can define where-ever you want to.

### Select
Build your database query in the frontend like...

```js
{
  name: 'macDonalds.employees',
  columns: [
    {name: 'firstName'},
    {name: 'lastName'},
    {name: 'age'}
  ],
  where: [
    'firstName = "Jimmy"'
  ]
}
```

This will get parsed as the following once it reaches MYSQL...

```sql
SELECT
macDonalds.employees.firstName,
macDonalds.employees.lastName,
macDonalds.employees.age

FROM
macDonalds.employees

WHERE
macDonalds.employees.firstName = "Jimmy"
```

So all we need is one endpoint that accepts **JSequal** objects and we can use it to replace
potentially hundreds of endpoints.

### Where
You'll notice `where` is an array. That's so we can add extra ones for multiple ANDs.

```js
{
  name: 'macDonalds.employees',
  columns: [
    {name: 'firstName'},
    {name: 'lastName'},
    {name: 'age'}
  ],
  where: [
    'firstName = "Jimmy"',
    'lastName = "Stansfield"',
  ]
}
```

```sql
SELECT 
firstName,
lastName,
age

FROM
macDonalds.employees

WHERE
firstName = "Jimmy"
AND
lastName = "Stansfield"
```

You can also put any kind of MYSQL condition inside each `where` string.

```js
where: [
  'firstName IS NOT NULL',
  'firstName != "Peter"',
  'age > 21',
  'age <= 32'
]
```

### Limit and Sort
Add a `limit` array and `sort` string to the object.

```js
{
  name: 'macDonalds.employees',
  columns: [
    {name: 'firstName'},
    {name: 'lastName'},
    {name: 'age'}
  ],
  limit: [0, 10],
  sort: 'lastName'
}
```

```sql
SELECT
firstName,
lastName,
age

FROM 
macDonalds.employees

LIMIT 0, 10
ORDER BY lastName
```

Add 'desc' to the `sort` string to reverse the sorting order.

```js
sort: 'lastName desc'
```

### Joins/Subselects
Jsequel's API is very simple because every `Object` in a query is exactly the same.
Here are *all* the possible keys you can use in Jsequel.

```js
{
  name:    String,
  columns: [Object, ...],
  where:   [String, ...],
  having:  [String, ...],
  group:   [String, ...],
  limit:   [Number, ...],
  sort:    String,
  as:      String
}
```

You can do a sub-select in a query object by nesting queries inside the `columns` array:

```js
{
  name: 'macDonalds.customers',
  columns: [
    {name: 'firstName'},
    {name: 'lastName'},
    {
      name: 'macDonalds.meals', columns: [
        {name: 'title'},
        {name: 'price'}
      ],
      where: [ 'meals.mealKey = customers.favouriteMealKey' ]
    }
  ],
  where: [ 'customers.firstName = "Bill"' ]
}
```

```sql
SELECT
firstName,
lastName,
(SELECT title FROM macDonalds.meals WHERE meals.mealKey = customers.favouriteMealKey) AS title,
(SELECT price FROM macDonalds.meals WHERE meals.mealKey = customers.favouriteMealKey) AS price

FROM
macDonalds.customers

WHERE
customers.firstName = "Bill"
```

Doing a `JOIN` in MYSQL is really useful but I decided against implementing them in JSequel.
Before you sigh and move on to another tool, hear me out.

Because they come in so many different forms (being `INNER JOIN`, `OUTER JOIN` `LEFT JOIN`,
`RIGHT JOIN` and `CROSS JOIN`) including all these variations would have complicated the implementation
and so instead I opted for sub queries. 

Sub-queries, I know, are slower but the advantage is that the final query has more in common 
structurally to the JSeq query object it's built from. It also lets us do infinitely nested
query objects, keep better track of the `AS` identifier and avoid having to alias conflicting
table names.

JSeq is designed for quick use in the frontend of a project, allowing devs to create queries without
having to turn to other members of the team to implement them. If you find that you need to 
do a highly optimised `JOIN` query then it's easy enough to create a [Custom Function](#custom-functions) to do that
(which you can find docs for below).

## Node usage
```js
// Use any mysql package from npm...
const mysql = require('mysql2/promise');
const connection = require('../libs/connection');

// Import your schema, more on this later.
const schema = require('../schema');

// Import JSequel...
const JSeq = require('jsequel');


async function example() {

  // Connect to mysql...
  const con = await mysql.createConnection(connection);

  // Make a new JSequel instance using your chosen schema.
  const jSeq= new JSeq(schema);

  // We're doing a get here so use selectQL and pass it your JSequel object...
  let queryObj = jSeq.selectSQ({
    name: 'macDonalds.employees',
    columns: [
      {name: 'firstName'},
      {name: 'lastName'},
      {name: 'age'}
    ],
    where: [
      'firstName = "Jimmy"',
      'lastName = "Stansfield"',
    ]
  });

  // Check the status of the returned object.
  if (queryObj.status === 'error') {
    console.log(queryObj);
    return;
  }

  let result;

  // JSequel will put your mysql string onto a param called query...
  try {
    result = await con.query(queryObj.query)
  } catch (err) {
    console.log(err)
  }
  console.log('result :', result[0]);
  await con.end()
}
```

## Query Functions

```js
const queryObject = jseq.selectSQ()

const queryObject = jseq.createSQ()

const queryObject = jseq.updateSQ()

const queryObject = jseq.deleteSQ()
```

```js
queryObject = {
  status: String,
  errors: [String, ...],
  query:  String
}
```

### Create
If you want to make a **CREATE** just add some `data`:

```js
let data = {
  _id: '123',
  firstName: 'Bob',
  lastName: 'Smith'
}

jSeq.createSQ({
  name: 'macDonalds.employees'
}, data);
```

### Update
To make an **UPDATE** just add a `where`.

```js
let data = {
  firstName: 'Bobby'
}

jSeq.updateSQ({
  name: 'macDonalds.employees',
  where: ['_id = "123"']
}, data);
```

**Note**: To update a record with a NULL value assign the string 'NULL' to it.

### Group By

Add a `group` array for `GROUP BY` queries.

```js
jSeq.selectSQ({
  name: 'macDonalds.payslips',
  columns: [
    {name: 'employeeId'}
    {name: 'sum=>(amount)', as: 'totalPay'},
  ],
  group: [ 'employeeId' ]
})
```

Will evaluate to:

```sql
SELECT

employeeId,
SUM(amount) AS totalPay

FROM
mcDonalds.employees

GROUP BY employeeId
```

# Schema
You'll need a schema for your database, this will prevent anyone from injecting dangerous
SQL into your db without **JSequel** stamping it out.

The structure of your schema object should look like:

```js
module.exports = {
  databaseName: {
    tableName1: {
      column1: {
        type: 'string'
      },
      column2: {
        type: 'string',
      }
    },
    tableName2: {
      column1: {
        type: 'number'
      }
    }
  }
  databaseName2: {
    // etc...
  }
}
```
Any columns not included in the schema will be automatically omitted from your queries.

The currently allowed `type` values are:

- string
- number
- json
- date

There's a few things the schema is capable of doing. See [Jseq Schema](#jseq-schema)

# Functions
You can use any of MYSQLs in-built functions by adding the function name to any `name` param.

```js
{
  name: 'macDonalds.employees',
  columns: [
    {name: 'concat=>(firstName " " lastName)', as: 'fullName'}
  ]
}
```

This will evaluate to

```sql
SELECT
CONCAT(firstName, " ", lastName) AS fullName

FROM
macDonalds.employees
```

You can nest functions inside one another.

```js
name: 'concat=>("Todays date: " date=>())'
```

All function names must be proceeded by `=>()`. All arguments are 
separated by a single space unless inside a " string ".

### JQSString Arguments

To pass a [JQString](#jqstring-json-query-strings) into a function 
it must be passed as a string beginning with `$`.

```js
name: 'sum=>("$jsonForm[?Units].value")', as: 'totalUnits'
```

# Custom Functions

Add custom functions using `addCustomFns` in your node controller
to make any kind of custom selection.

```js
const jseq = new JSQ(schema);

jseq.addCustomFns({
  firstAndLast: () => {
    return 'CONCAT(firstName, " ", lastName)';
  }
});

let jqueryObj = jseq.selectQL({
  name: 'macDonalds.employees',
  columns: [
    {name: 'firstAndLast=>()', as: 'fullName'}
  ]
});
```

A custom function must always return a string.

You can also add arguments to custom functions...

```js
{name: 'firstAndLast=>(firstName " " lastName)', as: 'fullName'}
```

That'll be passed through as individual strings.

```js
firstAndLast(first, space, last) {
  return `CONCAT(${first}, ${space}, ${last})`;
}
```

### Usage

Custom functions can be used to replace a whole query. If you 
want JSequel to do something a bit more complicated, make
the whole query inside the custom function and then call it
inside the first `name` param.

```js
jseq.addCustomFns({
  unionRecords: (...columns) => {
    return columns.map(colName => (
      `
        SELECT
        *
        FROM
        ${colName}
      `
    )).join(' UNION ');
  }
});

let jqueryObj = jseq.selectQL({
  name: 'unionRecords=>(macDonalds.orders macDonalds.meals)'
});
```

Any custom function used in combination with either `updateSQ` or
`createSQ` will be passed the `data` into it's *last* argument.

```js

// When I pass my data into the update...

jseq.updateSQ({
  name: 'myCustomFunc=>("123")'
}, data)


// I can access the data in the last arg of the custom function...

jseq.addCustomFns({
  myCustomFunc: function(numbers, data) {

    // do stuff...

  }
})


```


### Custom Objects

Custom functions can also access a custom object using `@`.

```js
name: 'useObjectInQuery=>("@")'
```

Add custom objects in the second argument of `addCustomFns`.

```js
const credentials = {
  publicKey: '321'
}

jseq.addCustomFns({useObjectInQuery}, credentials)
```

Now `@` represents the `credentials` object.

```js
jseq.addCustomFns({

  useObjectInQuery: credentials => {

    // do stuff with credentials...

  }

}, credentials)
```

Or I can select a specific item on `credentials` in my query...

```js
name: 'useObjectInQuery=>("@.publicKey")'
```

Now the argument passed will be the `publicKey` item on
`credentials`.

```js
jseq.addCustomFns({
  useObjectInQuery: publicKey => {
    // do stuff with key...
  }
}, credentials)
```

# JQString (Json Query Strings)
For tables with json type fields you can use a json query string to select specific values in an array.
All json query strings must start with a `$`, after that they're the same as javascript syntax.

Say you had a json column with an array of objects.

```sql
_____________________________
| mealTypes                 |
-----------------------------
|[                          |
| {                         |
|    type: 'burger',        |
|    name: 'Big Mac'        |  
| },                        |
| {                         |
|   type: 'chicken',        | 
|   name: 'Chicken Zinger'  |
| },                        |
| {                         |
|   type: 'sandwich',       |
|   name: 'The Chopper'     |
| },                        |
|]                          |
|                           |
```

```js
{
  name: 'macDonalds.orders'
  columns: [
    {name: '$mealTypes[0]', as: 'firstMealObject'},
  ]
}

// Would return...
// orders: [{
//   firstMealObject: {
//     type: 'burger',
//     name: 'Big Mac'
//   }
// }]
```

You can search the json column by any string value within using a string that starts with a '?'.

```js
{
  name: 'macDonalds.orders'
  columns: [
    {name: '$mealTypes[?Big Mac].type', as: 'biggMacType'}
  ]
}
// Would return...
// orders: [{
//   biggMacType: 'burger'
// }]
```
This finds an object in an array of objects by searching for the string 'Big Mac' then 
returns whatever is assigned to the key called `type`.

You can use **jQStrings** wherever you find a `name` parameter or to use them inside a function
argument just wrap the string in quotes...

```js
{name: 'concat=>("£" "$mealTypes[?Sandwich].price")'}
```

They are also compatible with the `data` sent to an `updateQL` function.
Rather than adding the **jQString** as a value, instead it goes in place of the *keyname* of the value you want to update.
This will only update the `value` param of the first object in the `jsonForm` array to have the string 'Jan'.

```js
updateQL({
  db: 'campaigns',
  table: 'bookings',
  where: [{name: 'bookingsKey', is: '"123"'}]
}, {
  "$jsonForm[0].value": 'Jan'
});
```

### JSON
JSequel will handle your json objects natively so you can just put them straight into your data
without having to do any `JSON.stringify` nonsense.

```js
jSeq.updateSQ({
  name: 'macDonalds.employees',
  where: ['_id = "123"']
}, {
  jsonForm: { label: 'Name', value: 'Jim', type: 'input' }
});
```

This project is basically a simplified v2 of [JsonQL](https://github.com/seanwarman/jsonQL). If you want
an idea of the roadmap for **JSequel** you can check out that project.

### MongoDB-like associations
Add an `as` to a nested column and JSequel will return those records inside an array.

So rather than starting with the `customer` to find their favourite meal you can start
with the meal and list every customer who has that meal as their favourite.
```js
{
  name: 'macDonalds.meals',
  columns: [
    {name: 'title'},
    {
      name: 'macDonalds.customers',
      columns: [
        {name: 'firstName'},
        {name: 'lastName'}
      ],
      where: ['meals.mealKey = customers.favouriteMealKey'],
      as: 'customersWhoLike' // <<
    }
  ],
  where: ['title = "Big Mac"']
}
```

This is very un-mysqlish but really useful for modern web apps.
```js
// Result...
{
  title: 'Big Mac',
  customersWhoLike: [
    {firstName: 'bill', lastName: 'ray'},
    {firstName: 'gemma', lastName: 'stonebridge'},
    // ...etc
  ]
}
```

When using nested jsons you must stick to more mongo-like results. So rather than 
doing mysql joins and having data from associate tables included in your results
you'll have to instead nest the results of associated tables.

**Note**: You cannot currently `limit` or `sort` nested jsons due to limitations
in mysql. Also note that any version before mysql 8.0 will replace duplicate keys
giving priority to the *first* key name it finds, unlike javascript.
See [here](https://dev.mysql.com/doc/refman/5.7/en/json.html#json-normalization)
for reference.

# Example
This is how I currently use JSequel with a frontend app project. 

I have four endpoints in my backend project for each CRUD method. They'd look a bit like this
in an ExpressJS backend...

```js
app.get('/jseq/:queryObj', myGetController);
app.post('/jseq/:queryObj', myPostController);
app.put('/jseq/:queryObj', myPutController);
app.delete('/jseq/:queryObj', myDeleteController);
```

Each controller looks like the node example further above, except they will use `jseq.selectSQ` for the GET,
`jseq.createSQ` for the POST, `jseq.updateSQ` for the PUT and `jseq.deleteSQ` for the DELETE.

Using a ajax method like `fetch` or `axios` I'd just send my request to one of the above endpoints using the appropriate CRUD method. 

```js
axios.get(`/jseq/${queryObj}`);
```

You can use the native javascript method `encodeURIComponent` with `JSON.stringify` to put the object directly 
into the URL which allows you to send the object without putting anything into the `body` of the request.

```js
const queryObj = decodeURIComponent(JSON.stringify({
  name: 'mcDonalds.employees',
  columns: [
    {name: 'firstName'},
    {name: 'lastName'},
    {name: 'telephone'},
  ]
}))


const employees = await axios.get(`/jseq/${queryObj}`);
```

# Jseq Schema

You can use the schema to create the db structure for you.

Here's an example schema:

```js
const schema = {
  macDonalds: {
    customers: {
      firstName: {
        type: 'string'
      },
      lastName: {
        type: 'string'
      },
      created: {
        type: 'date',
        default: 'create'
      }
    }
  }
}
```

You can store any number of databases in a schema just as long as they are all
under the same host, password and user.

The structure goes:

```js
databaseName: {
  tableName: {
    columnName: params
  }
}
```

Where `params` accepts the following key values.

```js
const params = {
  type: String,         // required, one of 'string' 'number' 'json' 'date'
  required: Bool,       // optional, one of true false
  maxLength: Number,    // optional, only applies to 'string' and 'number' types
  default: String,      // optional, only applies to 'date', one of 'update' 'create'
}
```

Adding `default: 'update'` to a `type: 'date'` will auto update the date on update,
adding `default: 'create'` will only make a date on the record's creation.

Every jseq database will automatically get an `id` column added to it's table
which will self increment. If you want to make a more unique key it's easy enough
to add a `type: 'string'` and update each record with an id type of your choice.

## createFromSchema

If I already have a database named `macDonalds` Jseq can build the schema
for my database using my json schema with it's `createFromSchema` function.

```js
const jseq = new JSequel(schema)

// createFromSchema returns a promise so it has to be awaited.
const queryObj = await jseq.createFromSchema()

```

The `queryObj` will return a `query` param like normal except this time
it'll be an array of queries. Run these through your chosen mysql library
and each query will update the db schema to match your json schema.

```js
console.log(queryObj)
// { status: 'success', query: [
//   'CREATE TABLE `configs` (`id` int(11) unsigned NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8',
//   'ALTER TABLE `configs` ADD COLUMN `host` varchar(200) NOT NULL',
//   'ALTER TABLE `configs` ADD COLUMN `user` varchar(200) NOT NULL',
//   'ALTER TABLE `configs` ADD COLUMN `password` varchar(200) NOT NULL',
//   'ALTER TABLE `configs` ADD COLUMN `port` varchar(200) NOT NULL',
//   'ALTER TABLE `configs` ADD COLUMN `database` varchar(200) NOT NULL',
//   'ALTER TABLE `configs` ADD COLUMN (`dbSchema` json)'
// ]}
```

Optionally you can also update your existing schema by passing a callback function
to `createFromSchema`.

```js
const queryObj = await jseq.createFromSchema(async(schemaQuery) => {

  // Use any mysql library you want. I'm using mysql2 here.
  const con = await mysql.createPool({...connection, connectionLimit: 900})

  let result

  // First you'll have to query your existing db to provide jseq with
  // it's structure.

  // schemaQuery is the provided query you'll need to produce the
  // right format for jseq.

  try {

    result = await con.query(schemaQuery)

  } catch (err) {

    console.log(err)
    await con.end()

    return
  }

  // Once it's done just return the result.
  return result[0]

})
```

**Warning** The above method is not safe for databases that are already in production, 
JSeqeul massively simplifies a mysql database to include the most useful column types
and presets many of the more nuanced functionality in mysql.

It is best to only update an existing schema if it is already being fully
managed by JSeq rather than updating the schema for a manually managed database.

It is not yet possible to change the values of a column using JSequel without
erasing the contents of that column so it's best to only use this functionality
when you want to build the initial structure of your database.
