# JSequel (BETA)
A small framework for building MYSQL queries with json objects.

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
const JSequel = require('jsequel');


async function example() {

  // Connect to mysql...
  const con = await mysql.createConnection(connection);

  // Make a new JSequel instance using your chosen schema.
  const jSequel = new JSequel(schema);

  // We're doing a get here so use selectQL and pass it your jsonQL object...
  let queryObj = jSequel.select({
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

  // jsonQL will put your mysql string onto a param called query...
  try {
    result = await con.query(queryObj.query)
  } catch (err) {
    console.log(err)
  }
  console.log('result :', result[0]);
  await con.end()
}
```

This project is basically a simplified v2 of [JsonQL](https://github.com/seanwarman/jsonQL). If you want
an idea of the roadmap for **JSequel** you can check out that project.

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
____________________________
mealTypes                  |
----------------------------
[
  {
    type: 'burger',
    name: 'Bigg Mac'
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
//     name: 'Bigg Mac'
//   }
// }]
```

You can search the json column by any string value within using a string that starts with a '?'.

```js
{
  name: 'macDonalds.orders'
  columns: [
    {name: '$mealTypes[?Bigg Mac].type', as: 'biggMacType'}
  ]
}
// Would return...
// orders: [{
//   biggMacType: 'burger'
// }]
```
This finds an object in an array of objects by searching for the string 'Bigg Mac' then 
returns whatever is assigned to the key called `type`.

You can use **jQStrings** wherever you find a `name` parameter so they even work in joins.
