# JSequel (BETA)
A small framework for controlling your API endpoints from the frontend. Much
like GraphQL but lighter and less obtrusive to your already complicated
stack. 

All **JSequel** does is make mysql query strings so it's also fast.

It allows you to build your database query in the frontend like...

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

Which get's parsed as the following once it reaches MYSQL...

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
    // ...AND
    'lastName = "Stansfield"',
  ]
}
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

### Joins
JOINs can be added as part of the `columns` array...

```js
{
  name: 'macDonalds.customers',
  columns: [
    {name: 'firstName'},
    {name: 'lastName'},
    {
      name: 'macDonalds.meals',
      columns: [
        {name: 'title'},
        {name: 'price'}
      ],
      where: ['meals.mealKey = customers.favouriteMealKey']
    }
  ]
}
```

Which is the same as...

```sql
SELECT
macDonalds.customers.firstName,
macDonalds.customers.lastName,
macDonalds.meals.title,
macDonalds.meals.price

FROM
macDonalds.customers

LEFT JOIN macDonalds.meals ON meals.mealKey = customers.favouriteMealKey
```


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

If you've had any experience with [serverless](https://serverless.com/) lambda functions
you'll know that if you want more than about 20 endpoints in a project, things start to
get pretty mad.

Lots of devs have turned to [GraphQL](https://graphql.org/) for this very reason but for
my particular needs I thought GraphQL was a bit overkill.

**JSequel** is light and fast because all it does is build mysql query strings. This means 
it can easily be added to your project without disrupting whatever structure you've already built.
It also works with a schema so it's safe as well.

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

jSeq.createSQ({
  name: 'macDonalds.employees',
  where: ['_id = "123"']
}, data);
```

## Schema
You'll need a schema for your database, this will prevent anyone from injecting dangerous
SQL into your db without **jsonQL** stamping it out.

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

## Functions
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

You can even nest functions inside one another.

```js
name: 'concat=>("Todays date: " date=>())'
```

# JQString (Json Query Strings)
For tables with json type fields you can use a json query string to select specific values in an array.
All json query strings must start with a `$`, after that they're the same as javascript syntax.

Say you had a json column with an array of objects.

```js
//____________________________
//mealTypes                  |
//----------------------------
[
  {
    type: 'burger',
    name: 'Big Mac'
  },
  {
    type: 'chicken',
    name: 'Chicken Zinger'
  },
  {
    type: 'sandwich',
    name: 'The Chopper'
  }
]
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

You can use **jQStrings** wherever you find a `name` parameter.


This project is basically a simplified v2 of [JsonQL](https://github.com/seanwarman/jsonQL). If you want
an idea of the roadmap for **JSequel** you can check out that project.

