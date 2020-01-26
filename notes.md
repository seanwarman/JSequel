```js
const TableObject = {
  name: String,
  where: [String/[String]],
  columns: [TableObject],
  as: String
}

const query = {
  name: 'bms_booking.booking',
  where: [
    'bookingsKey = "123"',
    'created = "2019"'
  ],
  columns: [
    {name: 'bookingName'},
    {name: 'created'},
    {
      name: 'Biggly.users', 
      where: [
        'bms_booking.booking.createdUserKey = userKey'
      ],
      columns: [
        {name: 'accessLevel'},
        {name: 'concat=>firstName lastName', as: 'fullName'}
      ]
    }
  ]
}
```
These could actually just be inline selects that repeat every time a column item is met.
```sql
SELECT
bookingName,
created,
(SELECT accessLevel FROM Biggly.users WHERE bms_booking.booking.createdUserKey = userKey) as accessLevel, 
-- ^ if no `as` value then use the `name` again.
(SELECT CONCAT(firstName, " ", lastName) FROM Biggly.users WHERE bms_booking.booking.createdUserKey = userKey) as fullName
FROM bms_booking.booking

HAVING bookingsKey = "123" AND created = "2019" 
-- ^ we could use HAVING rather than WHERE as it allows us to be more vague.
```

```js
const query = {
  name: 'bms_booking.booking',
  where: [
    'bookingName != "Bad Name"'
  ]
}

const query = {
  name: 'bms_booking.booking',
  where: [ 'bookingsKey = "123"' ],
  columns: [
    {name: 'bookingName'},
    {name: 'created'},
    {
      name: 'Biggly.uploads', 
      where: [
        'bms_booking.booking.bookingsKey = bookingsKey'
      ],
      columns: [
        {name: 'count=>*', as: 'uploadCount'}
      ]
    }
  ]
}
```
We could leave much of the details up to the user about whether they put the where assignments in the right order
or if the full db.table.column names are correctly selected.

That would give me space to simply create shorthands for many of the more laborious aspects of mysql syntax.

We should start by creating a function that deals with a single **TableObject** level. It should create a full SELECT
query with a WHERE.

Now we have joins working but we'll want to validate all the column selections ect with the schema. The columns should
be fairly easy because a `name` param is always either a single column or a db.table.

db.table is easy to validate so we do that first. once that's done we save the db.table in a global array of objects {db,table}
after that we can match up each column against these db and tables depending on where we are in the query.

The `where` strings will be much more difficult to deal with. We'll have to first split the string into blocks and validate each on.
The blocks will be.

string = '"word"'; // < in this case we validate the string.
number = '1'; // < no validation needed.
column = 'word'; // < in this case we get the db.table from the parent name.
table.column = 'word.word'; // < in this case we get the db from the parent name.
db.table.column = 'word.word.word'; // < in this case we can just validate straight off.
math = '=' || '>' || '<' || '>=' ... etc (look them up in mysql)

Divide the string by spaces.






Once the functions are done I could build custom functions that are mapped by name. They could call from a list of
custom queries we keep in the api somewhere. 

For example I could make a function for the bookings table calls that
requires more of a custom query that JSequal can't manage normally. That would mean that we don't need use another
lambda function for it! All the more custom functions could be stored as query strings in the api then called using
a specified fn name (eg myfunc=>).

We could even replace normal mysql functions like count so that they work within the syntax of JSequal.


Trying to created nested objects in mysql selects does work by using JSON_ARRAYAGG and JSON_OBJECT
can't select more than a single column from the nested select for some reason, who knows.

I think this finally puts the idea of using nested selects to bed. We can do what we want to achieve using a join though.
Try to get an object with all the values of a possible set of records inside a join.


If I get the bookingDivisions table then group by bookingDivKey and join to the bookings and put the bookingName in an array...

It works!

```sql
SELECT
bookingDivisions.bookingDivName,
JSON_ARRAYAGG(JSON_OBJECT("tmpName", divisionTemplates.tmpName)) as divisionTemplates
from bookingDivisions
left join divisionTemplates on bookingDivisions.bookingDivKey = divisionTemplates.bookingDivKey

group by bookingDivisions.bookingDivKey
```
This could possibly solve the count problem as well by doing a group by we could count the matching results
in a row rather than doing a nested select.

Yes it works for the count as well, you just have to add a the joined table.column to the argument and it'll tell
you how many you want to count by.

We might want to add a group by to every query.

What happens if you join more than one table that has multiple results per row? ANSWER: it breaks :( the count from
the second join affects the count of the first one and so the arrayagg function is also effected in the same way...

```sql
SELECT
JSON_ARRAYAGG(JSON_OBJECT("tmpName", divisionTemplates.tmpName)) as divisionTemplates,
count(divisionTemplates.tmpName) as tmpsAmt,
count(bookings.bookingsKey) as bookingAmt,
bookingDivisions.bookingDivName
from bookingDivisions
left join divisionTemplates on bookingDivisions.bookingDivKey = divisionTemplates.bookingDivKey
left join bookings on bookingDivisions.bookingDivKey = bookings.bookingDivKey
group by bookingDivisions.bookingDivKey
```
So you can only do one join like this at a time, meaning if we wanted to do two or more nested json records like this...well
we can't.

Shit. Scrub all that. It does work as a nested select... TODO
```slq
SELECT
(select JSON_ARRAYAGG(JSON_OBJECT("tmpName", divisionTemplates.tmpName, "tmpKey", divisionTemplates.tmpKey)) from divisionTemplates where divisionTemplates.bookingDivKey = bookingDivisions.bookingdivKey) as tmpsAmt,
(select json_arrayagg(json_object("bookingName", bookings.bookingName)) from bookings where bookings.bookingDivKey = bookingDivisions.bookingDivKey) as bookings,
bookingDivisions.bookingDivName
from bookingDivisions
```
Looks like sub selects are back on the table!

Here's how it should work.

```js
name: 'bms_booking.bookings',
columns: [
  {name: 'bookingName'},
  {name: 'bookingsKey'},
  {name: 'createdUserKey'
],
where: [
  'bookingsKey = "123"'
]

queryObj.columns.forEach(col => {
  selects.push(

  )
})

let select = `
  (SELECT ${col.name} FROM ${queryObj.name} WHERE ${queryObj.where}) ${queryObj.as}
  (SELECT ${col.name} FROM ${queryObj.name} WHERE ${queryObj.where}) ${queryObj.as}
  (SELECT ${col.name} FROM ${queryObj.name} WHERE ${queryObj.where}) ${queryObj.as}
`;
```

We only want to do it like the above if it's in one of the join columns.
If we're in the top level (eg the first db.table selection) we want it to act normally.




Finish fixing the function logic then move on to returning nested json records.

We want to find all the possible usefull variables in a name string.

```js
/\w+\=\>|[\(\)]|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g
```

This regex gets all the things we want and it puts the braces as their own items
which will help us to decide where everything is supposed to go in the function
args.

Functions work great but we can't yet have custom functions until I make the function parser
a bit smarter.

I'll have to leave custom functions as a future feature for now.

For a nested record all you have to do is add an `as` param to the parent object.

```js
const query = {
  name: 'bms_booking.bookings',
  columns: [
  {name: 'bookingName'},
  {name: 'bookingsKey'},
    {
      name: 'bms_booking.uploads',
      columns: [
        {name: 'fileName'},
        {name: 'uploadKey', as: 'tmpUploadKey'}
      ],
      where: [
       'bookings.bookingsKey = uploads.bookingsKey'
      ],
      as: 'uploads' // < here
    }
  ]
}

//  SELECT
//  bookingName,
//  bookingsKey,
//  (select JSON_ARRAYAGG(JSON_OBJECT("fileName", uploads.fileName, "tmpUploadKey", uploads.uploadKey)) from uploads where bookings.bookingsKey = uploads.bookingsKey) as uploads
//  from bms_booking.bookings


//  result[0] = {
//   bookingName: 'Cool Booking',
//   bookingsKey: '123',
//   uploads: [
//     { filName: 'Great file', tmpUploadKey: '1234' },
//     { filName: 'Greater file', tmpUploadKey: '12345' },
//   ]
// }
```

Make json query strings compatible with `where` strings.

