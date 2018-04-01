const defaultOpts = {
	dbUrl: "mongodb://127.0.0.1:27017",
	dbName: "userdb",
	collectionName: "users",
	userExpire: 1 /*hour*/*60*60*1000,
	anonData: {
		access: 1
	}
}

module.exports = function(opts) {

	let postInitExports = new Object();

	//Fill in any missing fields
	Object.setPrototypeOf(opts,defaultOpts);

	// Imports
	const mongodb = require("mongodb");
	const hash = require("password-hash");
	const path = require("path");

	// Database connection
	let db = new Promise((resolve,reject) => {
		mongodb.MongoClient.connect(opts.dbUrl,function(err,dbClient) {
			if(err) {
				reject(err);
			} else {
				let db = dbClient.db(opts.dbName);
				resolve({
					db: db,
					users: db.collection(opts.collectionName)
				});
			}
		});
	});

	// User client auth
	var users = new Map();
	class UserClient {
		constructor(username,password) {
			this.promise = new Promise((resolve,reject) => {
				db.then((dbStuff) => {
					dbStuff.users.find({
						username: username
					}).toArray((err,items) => {
						if(items.length==1 && hash.verify(password,items[0].password)) {
							this.username = username;
							this.uuid = generateUUID();
							this.initData = items[0].data;
							users.set(this.uuid,this);
							this.timeout = setTimeout(() => {
								users.delete(this.uuid);
							},opts.userExpire);
							resolve(this);
						} else {
							reject("Username or password not correct");
						}
					});
				});
			});
		}
		get data() {
	        // Reset user timeout
			clearTimeout(this.timeout);
			this.timeout = setTimeout(() => {
				users.delete(this.uuid);
			},opts.userExpire);

	        // Get the user's data
			return new Promise((resolve) => {
				db.then((dbStuff) => {
					dbStuff.users.find({
						username: this.username
					}).toArray((err,items) => {
						resolve(items[0].data);
					});
				});
			});
		}
		set data(newData) {
			db.then((dbStuff) => {
				dbStuff.users.findOneAndUpdate({
					username: this.username
				},{
					$set: {
						data: newData
					}
				});
			});
		}
		setData(newData) {
			return new Promise((resolve) => {
				db.then((dbStuff) => {
					dbStuff.users.findOneAndUpdate({
						username: this.username
					},{
						$set: {
							data: newData
						}
					},resolve);
				});
			});
		}
		verifyPassword(password) {
			return new Promise((resolve,reject) => {
				db.then((dbStuff) => {
					dbStuff.users.find({
						username: this.username
					}).toArray((err,items) => {
						if(items.length==1 && hash.verify(password,items[0].password)) {
							resolve(true);
						} else {
							reject("Username or password not correct");
						}
					});
				});
			});
		}
		changePassword(newPassword) {
			return new Promise((resolve,reject) => {
				db.then((dbStuff) => {
					dbStuff.users.findOneAndUpdate({
						username: this.username
					},{
						$set: {
							password: hash.generate(newPassword)
						}
					},resolve);
				});
			});
		}
		renew() {
	        // Stop user timeout
			clearTimeout(this.timeout);

	        // Give them a new UUID
			let oldUUID = this.uuid;
			this.uuid = generateUUID();
			users.set(this.uuid,this);
			users.delete(oldUUID);
			return this.uuid;

	        // Set the timeout
			this.timeout = setTimeout(() => {
				users.delete(this.uuid);
			},opts.userExpire);
		}
		deAuth() {
	        // Since we are deleting the user now, there's no reason to later
			clearTimeout(this.timeout);
			users.delete(this.uuid);
		}
	}

	// Exports
	postInitExports.init = function(app,addLoginHandlers) {
		let express = require("express");
		// Parsers
		app.use(require("cookie-parser")());
		app.use(express.json());
		app.use(express.urlencoded({extended:true}));
		app.use(postInitExports.userMiddleware());

		if(!(addLoginHandlers===false)) {
			// USER MANAGEMENT PAGES
			app.use("/login",postInitExports.loginMiddleware);
			app.use("/logout",postInitExports.logoutMiddleware);
		}
	}

	postInitExports.createUser = createUser;

	postInitExports.checkAccess = function(username) {
		return new Promise((resolve) => {
			db.then((dbStuff) => {
				dbStuff.users.find({
					username: username
				}).toArray((err,items) => {
					if(!err) {
						resolve(items[0].data.access);
					}
				});
			});
		});
	}

	postInitExports.restrict = function(restrictionLevel) {
		return (req,res,next) => {
			req.user.data.then((data) => {
				if(data.access>=restrictionLevel) {
					next();
				} else {
					res.status(401).redirect("/login?referrer="+encodeURIComponent(req.originalUrl));
				}
			});
		};
	}

	postInitExports.userMiddleware = function() {
		return (req,res,next) => {
			let user = users.get(req.cookies.auth);
			if(user) {
				req.user = user;
			} else {
				req.user = {
					username: "anonymous",
					initData: opts.anonData,
					data: Promise.resolve(opts.anonData)
				};
			}
			next();
		};
	}

	postInitExports.loginMiddleware = function(req,res,next) {
		if(req.body.username && req.body.password) {
			new UserClient(req.body.username,req.body.password).promise.then((user) => {
				res.cookie("auth",user.uuid).redirect(req.body.referrer || "../");
			}).catch((errMsg) => {
				req.authError = errMsg;
				next()
			});
		} else {
			next();
		}
	}

	postInitExports.logoutMiddleware = function(req,res,next) {
		if(req.cookies.auth) {
			users.delete(req.cookies.auth);
			res.clearCookie("auth");
		}
		res.redirect("back");
	}

	postInitExports.updateUserData = updateUserData;

	postInitExports.updateUserPassword = updateUserPassword;

	postInitExports.removeUser = removeUser;

	postInitExports.users = users;

	postInitExports.UserClient = UserClient;

	postInitExports.db = db;

	// Functions in function scope
	function generateUUID() {
		var d = new Date().getTime();

		var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			var r = (d + Math.random()*16)%16 | 0;
			d = Math.floor(d/16);
			return (c=='x' ? r : (r&0x3|0x8)).toString(16);
		});

		return uuid;
	}

	function createUser(username,password,extras) {
		return new Promise((resolve,reject) => {
			db.then((dbStuff) => {
				dbStuff.users.find({
					username: username
				}).toArray((err,items) => {
					if(!err) {
						if(items.length===0) {
							dbStuff.users.insertOne({
								username: username,
								password: hash.generate(password),
								data: extras || opts.anonData
							});
							resolve(true);
						} else {
							reject("User already exists");
						}
					}
				});
			});
		});
	}

	function removeUser(username) {
		return new Promise((resolve,reject) => {
			db.then((dbStuff) => {
				let status = dbStuff.users.remove({username: username});
				if(status.nRemoved===0) {
					reject("User not found");
				} else {
					resolve("Deleted user");
				}
			});
		});
	}

	function updateUserData(username,userData) {
		return new Promise((resolve) => {
			db.then((dbStuff) => {
				dbStuff.users.findOneAndUpdate({
					username: username
				}, {
					$set: {data: userData}
				},resolve);
			});
		});
	}

	function updateUserPassword(username,password) {
		return new Promise((resolve) => {
			db.then((dbStuff) => {
				dbStuff.users.findOneAndUpdate({
					username: username
				}, {
					$set: {password: hash.generate(password)}
				},resolve);
			});
		});
	}

	return postInitExports;
}
