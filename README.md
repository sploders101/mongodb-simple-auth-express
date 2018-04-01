# MongoDB Auth
---
## Description
Coming Soon!

## Documentation

### Initialization
#### Prerequisites
In order to authenticate properly, it is recommended to have a custom login page at /login, with a form that submits POST data to the same path (omit action="...") with username, password, and optional referrer (to redirect the user where they came from)
#### Automated
Because the module needs the ability to use certain pre-processors, as well as injecting login middleware for authentication processing you must initialize the module first before using it.
```javascript
// Setup express
let express = require("express");
let app = express();

// Setup auth
let auth = require("auth")({
	dbUrl: "mongodb://127.0.0.1:27017",
	dbName: "userdb",
	collectionName: "users",
	userExpire: 1 /*hour*/*60*60*1000,
	anonData: {
		access: 1
	}
});
// These are the default values for the options property, but any of these can be either omitted or changed
auth.init(app,/*optional boolean, default: true*/ addLoginHandlers);
```
#### Manual
If you would prefer to setup the environment manually, the following code can be used.
```javascript
// Parsers (required)
app.use(require("cookie-parser")());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(auth.userMiddleware());

// USER MANAGEMENT PAGES (this is optional, but HIGHLY recommended)
// You must manually authenticate your clients without these, rendering this module mostly useless
app.use("/login",auth.loginMiddleware);
app.use("/logout",auth.logoutMiddleware);
```

### Middleware
#### Restrict page
In order to restrict a page, put this function before the handler for the page you would like to restrict
```javascript
app.use(pageLocation,auth.restrict(restrictionLevel));
app.use(pageLocation,/*Your listener (works with express.static as well)*/);
```


### Regular functions
#### Manage Users
```javascript
auth.createUser(username,password,{
	// User Data
	access: 2 //access level of the user (required field)
});
auth.updateUserData(username,{
	// User Data (uses update, so doesn't delete anything)
});
auth.updateUserPassword(username,newPassword);
auth.removeUser(username);
```
#### Testing user access
```javascript
auth.checkAccess(username).then((accessLevel) => {
	//Do stuff with accessLevels
});
```

### Classes
#### UserClient
An instance of this class is created every time a user logs in, and is deleted either when they log out or after an hour of inactivity. (This is configurable in the constants at the top of index.js) It is also returned in every request under req.user.
* ToDo:
	* setData(newData)
* UserClient
	* __constructor__: takes username,password and logs the user into the server, assigning them a temporary UUID
	* __getter data__: returns a promise that resolves with userData, which includes the access property in the top level
	* __setter data__: updates user data with the new value. This will not delete any unspecified properties, nor is it synchronous. This is an easy solution for setting a user's data, if it does not need to be updated instantaneously. Use setData(newData) for anything time-sensitive.
	* __setData(newData)__: Updates user data with newData, and returns a promise, resolving when it is finished, and rejecting in the case of an error.
	* __renew()__: trashes the user's current UUID, and generates a new one, resetting their timeout
	* __deAuth()__: deauthorizes the user, trashing their UUID and removing all references to their class, allowing it to be GC'd.

### Properties
These are not meant to be used, but exposed anyway just in case you need to do something with them.
#### users
The auth.users property is a map with the user's uuid as the key, and their UserClient object as the property.
