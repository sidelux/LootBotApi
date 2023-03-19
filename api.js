process.on('uncaughtException', function (err) {
	console.error("\x1b[31m" + err.stack + "\x1b[0m");
});

process.on('unhandledRejection', function(reason, p){
	console.error("\x1b[31m" + reason.stack + "\x1b[0m");
});

var express = require('express');
var mysql = require('mysql');
var escape = require('jsesc');
var rlimit = require('express-rate-limit');
var config = require('./config.js');

const max_duration_query = 1000

var dbConnection = mysql.createPool({
	host: config.dbhost,
	database: config.dbdatabase,
	user: config.dbuser,
	password: config.dbpassword,
	timezone: 'GMT',
	connectionLimit: 100
});

const connection = {
	end: dbConnection.end,
	  query: function (q, fn) {
		  const startTime = new Date()
		  return dbConnection.query(q, function (err, res, fields) {
			  const duration = new Date() - startTime
			  if (duration > max_duration_query) console.log("QUERY", q, "EXECUTED IN", duration, "ms")
			  fn(err, res, fields)
		  })
	  },
	  queryAsync: async (str, values) => new Promise((resolve, reject) => {
		  const startTime = new Date()
		  dbConnection.query(str, function (err, res, fields) {
			  const duration = new Date() - startTime
			  if (duration > max_duration_query) console.log("SYNC QUERY", str, "EXECUTED IN", duration, "ms")
			  if (err) {
				  reject(err)
			  } else {
				  resolve(res)
			  }
		  })
	  })
  }

var api = express.Router();
var json_response;

var limiter = new rlimit({
	windowMs: 60000,
	max: 1000
});
api.use(limiter);

api.get('/', function(req, res) {
	res.send('** LootBot Public API **');
});

api.get('/*/', function(req, res, next) {
	console.log(getNow("it") + " - " + req.connection.remoteAddress.substr(7) + ": " + req.originalUrl);
	next();
});

function getNow(lang, obj) {
	var d = new Date();
	obj = typeof obj !== 'undefined' ? obj : false;
	var datetime;
	if (lang == "it") {
		datetime = addZero(d.getDate()) + "/" + addZero(d.getMonth() + 1) + "/" + d.getFullYear() + " " + addZero(d.getHours()) + ':' + addZero(d.getMinutes()) + ':' + addZero(d.getSeconds());
	} else if (lang == "en") {
		datetime = d.getFullYear() + "-" + addZero(d.getMonth() + 1) + "-" + addZero(d.getDate()) + " " + addZero(d.getHours()) + ':' + addZero(d.getMinutes()) + ':' + addZero(d.getSeconds());
	} else
		datetime = "Error";
	if (obj == true)
		datetime = new Date(datetime);
	return datetime;
}

function addZero(i) {
	if (i < 10)
		i = "0" + i;
	return i;
}

api.get('/v2/:token/items', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT item.id, item.name, item.rarity, item.description, item.value, item.max_value, item.estimate, item.spread, item.spread_tot, item.craftable, item.reborn, item.power, item.power_armor, item.power_shield, item.dragon_power, item.critical, item.category, item.cons, item.allow_sell, rarity.name as rarity_name, item.pnt_sum As craft_pnt, item.cons_val, item.total_cnt As dist FROM item JOIN rarity ON item.rarity = rarity.shortname WHERE searchable = 1 ORDER BY rarity.id";
		dbConnection.query(query, function (err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}else{
				if (Object.keys(rows).length == 0){
					json_response = {
						"code"  :   400,
						"res"  	:   "ERROR - Nessun risultato"
					};
				}else {
					json_response = {
						"code"  :   200,
						"res"  	:   rows
					};
				}
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/:token/items/:item', function(req, res) {
	var item = escape(req.params.item);
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}
		var query = "SELECT 1 FROM rarity WHERE shortname = '" + escape(item) + "'";
		dbConnection.query(query, function (err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				if (Object.keys(rows).length == 0) {
					if (isNaN(item)) {
						query = "SELECT item.id, item.name, item.rarity, rarity.name as rarity_name, item.value, item.max_value, item.estimate, item.spread, item.spread_tot, item.craftable, item.reborn, item.power, item.power_armor, item.power_shield, item.dragon_power, item.critical, item.pnt_sum As craft_pnt, item.cons_val, item.total_cnt As dist FROM item JOIN rarity ON item.rarity = rarity.shortname WHERE item.name LIKE '%" + escape(item) + "%'";
						dbConnection.query(query, function (err, rows) {
							if (err) {
								json_response = {
									"code"  :   400,
									"error" :   err
								};
							}
							else {
								if (Object.keys(rows).length == 0) {
									json_response = {
										"code"  :   400,
										"error" :   "ERROR - L'oggetto non esiste"
									};
								} else {
									if (Object.keys(rows).length == 1) {
										json_response = {
											"code"  :   200,
											"res"   :   rows[0]
										};
									}
									else {
										json_response = {
											"code"  :   200,
											"res"   :   rows
										};
									}
								}
							}
							res.json(json_response);
						});
					} else {
						query = "SELECT item.id, item.name, item.rarity, rarity.name as rarity_name, item.value, item.max_value, item.estimate, item.spread, item.spread_tot, item.craftable, item.reborn, item.power, item.power_armor, item.power_shield, item.dragon_power, item.critical, item.pnt_sum As craft_pnt, item.cons_val, item.total_cnt As dist FROM item JOIN rarity ON item.rarity = rarity.shortname WHERE item.id = '" + escape(item) + "'";
						dbConnection.query(query, function (err, rows) {
							if (err) {
								json_response = {
									"code"  :   400,
									"error" :   err
								};
							}else{
								if (Object.keys(rows).length == 0) {
									json_response = {
										"code"  :   400,
										"error" :   "ERROR - L'oggetto non esiste"
									};
								}else{
									json_response = {
										"code"  :   200,
										"res"   :   rows[0]
									};
								}
							}
							res.json(json_response);
						});
					}
				} else {
					if (isNaN(item)) {
						query = "SELECT item.id, item.name, item.rarity, rarity.name as rarity_name, item.value, item.max_value, item.estimate, item.spread, item.spread_tot, item.craftable, item.reborn, item.power, item.power_armor, item.power_shield, item.dragon_power, item.critical, item.pnt_sum As craft_pnt, item.cons_val, item.total_cnt As dist FROM item JOIN rarity ON item.rarity = rarity.shortname WHERE rarity.shortname = '" + escape(item) + "'";
						dbConnection.query(query, function (err, rows) {
							if (err) {
								json_response = {
									"code"  :   400,
									"error" :   err
								};
							}
							else {
								if (Object.keys(rows).length == 0) {
									json_response = {
										"code"  :   400,
										"error" :   "ERROR - La rarità specificata non contiene oggetti"
									};
								}else {
									if (Object.keys(rows).length == 1) {
										json_response = {
											"code"  :   200,
											"res"   :   rows[0]
										};
									}
									else {
										json_response = {
											"code"  :   200,
											"res"   :   rows
										};
									}
								}
							}
							res.json(json_response);
						});
					} else {
						query = "SELECT item.id, item.name, item.rarity, rarity.name as rarity_name, item.value, item.max_value, item.estimate, item.spread, item.spread_tot, item.craftable, item.reborn, item.power, item.power_armor, item.power_shield, item.dragon_power, item.critical, item.pnt_sum As craft_pnt, item.cons_val, item.total_cnt As dist FROM item JOIN rarity ON item.rarity = rarity.shortname WHERE rarity.shortname = '" + escape(item) + "'";
						dbConnection.query(query, function (err, rows) {
							if (err) {
								json_response = {
									"code"  :   400,
									"error" :   err
								};
							}else{
								if (Object.keys(rows).length == 0) {
									json_response = {
										"code"  :   400,
										"error" :   "ERROR - La rarità specificata non contiene oggetti"
									};
								}else{
									json_response = {
										"code"  :   200,
										"res"   :   rows[0]
									};
								}
							}
							res.json(json_response);
						});
					}
				}
			}
		});

		dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
	});
});

api.get('/v2/:token/cards', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT id, name, rarity FROM card_list";
		dbConnection.query(query, function (err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}else{
				if (Object.keys(rows).length == 0){
					json_response = {
						"code"  :   400,
						"res"  	:   "ERROR - Nessun risultato"
					};
				}else {
					json_response = {
						"code"  :   200,
						"res"  	:   rows
					};
				}
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/crafts/', function(req, res) {
	json_response = {
		"code"  :   400,
		"error" :   "ERROR - Utilizza /itemid/needed|used"
	};
	res.json(json_response);
});

api.get('/v2/:token/crafts/:itemId/:type', function(req, res) {
	var itemId = parseInt(req.params.itemId);
	var type = req.params.type;

	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query;

		if (isNaN(itemId)) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Specifica un numero per l'id"
			};
			res.json(json_response);
		}
		else if (type == "needed") {
			query = "SELECT item.id, item.name, item.rarity, item.craftable FROM item JOIN craft ON craft.material_1 = item.id OR craft.material_2 = item.id OR craft.material_3 = item.id WHERE craft.material_result = " + itemId;
		}
		else if (type == "used") {
			query = "SELECT item.id, item.name, item.rarity FROM item JOIN craft ON craft.material_result = item.id WHERE craft.material_1 = " + itemId + " OR craft.material_2 = " + itemId + " OR craft.material_3 = " + itemId;
		}
		else {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Tipo non valido"
			};
			res.json(json_response);
		}

		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				if (Object.keys(rows).length == 0) {
					json_response = {
						"code"  :   400,
						"error" :   "ERROR - L'oggetto non esiste"
					};
				}
				else {
					json_response = {
						"code"  :   200,
						"item"  :   itemId,
						"res"  :   rows
					};
				}
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/search/', function(req, res) {
	json_response = {
		"code"  :   400,
		"error" :   "ERROR - Inserisci un valore limite come quantità"
	};
	res.json(json_response);
});

api.get('/v2/:token/search/:limit', function(req, res) {
	var limit = req.params.limit;
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		limit = parseInt(limit);

		if (isNaN(limit) || (limit < 1)) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Inserisci un numero valido come limite"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT * FROM search_public ORDER BY time DESC LIMIT " + limit;
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				json_response = {
					"code"  :   200,
					"res"   :   rows
				};
			}
			res.json(json_response)
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/:token/players', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT * FROM player_public WHERE (team_id != 1113 OR team_id IS NULL) ORDER BY nickname";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				json_response = {
					"code"  :   200,
					"res"   :   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/:token/crafts/id', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT * FROM craft_public_id ORDER BY id";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				json_response = {
					"code"  :   200,
					"res"   :   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/:token/info', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT (SELECT global_eventon FROM config) As global_on, (SELECT global_eventhide FROM config) As global_cap_hide, SUM(value) As global_tot, (SELECT global_cap FROM config) As global_cap, COUNT(player_id) As global_members, (SELECT global_limitcnt FROM config) As global_limit FROM achievement_global";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {

				if (rows[0].global_on == 0){
					rows[0].global_tot = 0;
					rows[0].global_cap = 0;
					rows[0].global_members = 0;
					rows[0].global_limit = 0;
				}

				if (rows[0].global_cap_hide == 1){
					rows[0].global_cap = 0;
					rows[0].global_limit = 0;
				}

				json_response = {
					"code"  :   200,
					"res"   :   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/:token/global', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT id, value, players, insert_time FROM global_hourly ORDER BY id";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				json_response = {
					"code"  :   200,
					"res"   :   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/:token/global/ranking', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT global_eventon, global_cap FROM config";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
				res.json(json_response);
				return;
			}
			else {
				if (rows[0].global_eventon == 0) {
					json_response = {
						"code"  :   400,
						"error" :   "Globale non ancora in corso"
					};
					res.json(json_response);
					return;
				}
			}

			const global_cap = rows[0].global_cap;

			var query = "SELECT ROW_NUMBER() OVER (ORDER BY A.value DESC) AS pos, A.player_id, P.nickname, A.value, P.reborn FROM achievement_global A, player P WHERE P.id = A.player_id ORDER BY A.value DESC";
			dbConnection.query(query, function(err, rows) {
				if (err) {
					json_response = {
						"code"  :   400,
						"error" :   err
					};
				}
				else {
					var my_pnt = 0;
					var global_limit_perc = 0;
					var global_limit_val = 0;
					for (var i = 0, len = Object.keys(rows).length; i < len; i++) {
						my_pnt = rows[i].value;
						global_limit_perc = 0.15 + (rows[i].reborn * 0.03);
						global_limit_val = Math.round(global_cap * global_limit_perc / 100);
	
						if (my_pnt >= global_limit_val)
							rows[i].global_point = true;
						else
							rows[i].global_point = false;
					}
					json_response = {
						"code"  :   200,
						"res"   :   rows
					};
				}
				res.json(json_response);
				dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
			});
		});
	});
});

api.get('/v2/:token/global/ranking/:name', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query = "SELECT global_eventon, global_cap FROM config";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
				res.json(json_response);
				return;
			}
			else {
				if (rows[0].global_eventon == 0) {
					json_response = {
						"code"  :   400,
						"error" :   "Globale non ancora in corso"
					};
					res.json(json_response);
					return;
				}
			}

			const global_cap = rows[0].global_cap;

			var name = req.params.name;
			var query = "SELECT * FROM (SELECT ROW_NUMBER() OVER (ORDER BY A.value DESC) AS pos, A.player_id, P.nickname, A.value, P.reborn FROM achievement_global A, player P WHERE P.id = A.player_id ORDER BY A.value DESC) As t WHERE nickname = '" + escape(name) + "'";
			dbConnection.query(query, function(err, rows) {
				if (err) {
					json_response = {
						"code"  :   400,
						"error" :   err
					};
				}
				else {
					if (Object.keys(rows).length == 0) {
						json_response = {
							"code"  :   400,
							"error" :   "Il giocatore specificato non è in classifica o non esiste"
						};
						res.json(json_response);
						return;
					}
					const my_pnt = rows[0].value;
					const global_limit_perc = 0.15 + (rows[0].reborn * 0.03);
					const global_limit_val = Math.round(global_cap * global_limit_perc / 100);

					if (my_pnt >= global_limit_val)
						rows[0].global_point = true;
					else
						rows[0].global_point = false;

					json_response = {
						"code"  :   200,
						"res"   :   rows
					};
				}
				res.json(json_response);
				dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
			});
		});
	});
});

api.get('/v2/players/', function(req, res) {
	json_response = {
		"code"  :   400,
		"error" :   "ERROR - Inserisci almeno una parte del nickname"
	};
	res.json(json_response);
});

api.get('/v2/:token/players/:name', function(req, res) {
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var name = req.params.name;
		var query = "SELECT * FROM player_public WHERE (team_id != 1113 OR team_id IS NULL) AND nickname LIKE '%" + escape(name) + "%' ORDER BY nickname";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				json_response = {
					"code"  :   200,
					"res"   :   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/history/', function(req, res) {
	json_response = {
		"code"  :   400,
		"error" :   "ERROR - Inserisci almeno il parametro type"
	};
	res.json(json_response);
});

api.get('/v2/:token/history/:type', function(req, res) {
	var type = escape(req.params.type);
	var quantity = escape(req.query.limit);
	var offset = escape(req.query.offset);
	var fromNick = escape(req.query.from);
	var toNick = escape(req.query.to);
	var both = escape(req.query.both);
	var item1 = escape(req.query.fromItem);
	var item2 = escape(req.query.toItem);
	var fromPrice = escape(req.query.fromPrice);
	var toPrice = escape(req.query.toPrice);
	var orderBy = escape(req.query.orderBy);
	var fromDate = escape(req.query.fromDate);
	var toDate = escape(req.query.toDate);
	
	if (orderBy != "undefined"){
		if ((orderBy != "asc") && (orderBy != "desc")){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Ordinamenti disponibli: asc/desc (default: desc)"
			};
			res.json(json_response);
			return;
		}
	} else
		orderBy = "desc";
	
	orderBy = orderBy.toUpperCase();

	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query;

		var where = " 1=1";
		if (type == "market_direct"){
			if (fromNick != "undefined")
				where += " AND from_nick = '" + fromNick + "'";
			if (toNick != "undefined")
				where += " AND to_nick = '" + toNick + "'";
			if (item1 != "undefined")
				where += " AND name = '" + item1 + "'";
			if (both != "undefined")
				where += " AND (from_nick = '" + both + "' OR to_nick = '" + both + "')";
			if (fromPrice != "undefined")
				where += " AND price >= " + fromPrice;
			if (toPrice != "undefined")
				where += " AND price <= " + toPrice;
			if (fromDate != "undefined")
				where += " AND time >= '" + fromDate + "'";
			if (toDate != "undefined")
				where += " AND time <= '" + toDate + "'";
		}else if (type == "market"){
			if (fromNick != "undefined")
				where += " AND from_nick = '" + fromNick + "'";
			if (toNick != "undefined")
				where += " AND to_nick = '" + toNick + "'";
			if (item1 != "undefined")
				where += " AND name_1 = '" + item1 + "'";
			if (item2 != "undefined")
				where += " AND name_2 = '" + item2 + "'";
			if (both != "undefined")
				where += " AND (from_nick = '" + both + "' OR to_nick = '" + both + "')";
			if (fromDate != "undefined")
				where += " AND time >= '" + fromDate + "'";
			if (toDate != "undefined")
				where += " AND time <= '" + toDate + "'";
		}else if (type == "lotteries"){
			if (fromNick != "undefined")
				where += " AND creator = '" + fromNick + "'";
			if (toNick != "undefined")
				where += " AND player = '" + toNick + "'";
			if (item1 != "undefined")
				where += " AND item = '" + item1 + "'";
			if (fromPrice != "undefined")
				where += " AND money >= " + fromPrice;
			if (toPrice != "undefined")
				where += " AND money <= " + toPrice;
			if (fromDate != "undefined")
				where += " AND time >= '" + fromDate + "'";
			if (toDate != "undefined")
				where += " AND time <= '" + toDate + "'";
		}else if (type == "auctions"){
			if (fromNick != "undefined")
				where += " AND creator = '" + fromNick + "'";
			if (toNick != "undefined")
				where += " AND player = '" + toNick + "'";
			if (item1 != "undefined")
				where += " AND item = '" + item1 + "'";
			if (fromPrice != "undefined")
				where += " AND price >= " + fromPrice;
			if (toPrice != "undefined")
				where += " AND price <= " + toPrice;
			if (fromDate != "undefined")
				where += " AND time >= '" + fromDate + "'";
			if (toDate != "undefined")
				where += " AND time <= '" + toDate + "'";
		}else if (type == "payments"){
			if (fromNick != "undefined")
				where += " AND from_nick = '" + fromNick + "'";
			if (toNick != "undefined")
				where += " AND to_nick = '" + toNick + "'";
			if (both != "undefined")
				where += " AND (from_nick = '" + both + "' OR to_nick = '" + both + "')";
			if (fromPrice != "undefined")
				where += " AND price >= " + fromPrice;
			if (toPrice != "undefined")
				where += " AND price <= " + toPrice;
			if (fromDate != "undefined")
				where += " AND time >= '" + fromDate + "'";
			if (toDate != "undefined")
				where += " AND time <= '" + toDate + "'";
		}else if (type == "heists"){
			if (fromNick != "undefined")
				where += " AND from_nick = '" + fromNick + "'";
			if (toNick != "undefined")
				where += " AND to_nick = '" + toNick + "'";
			if (both != "undefined")
				where += " AND (from_nick = '" + both + "' OR to_nick = '" + both + "')";
			if (fromDate != "undefined")
				where += " AND time >= '" + fromDate + "'";
			if (toDate != "undefined")
				where += " AND time <= '" + toDate + "'";
		}

		if (quantity == "undefined")
			quantity = 100;

		if (offset == "undefined")
			offset = 0;

		if (quantity > 1000){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Il limit non può essere più alto di 1.000, usa i filtri per ottenere più risultati utili"
			};
			res.json(json_response);
			return;
		}

		if (offset > 10000){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - L'offset non può essere più alto di 10.000, usa i filtri per ottenere più risultati utili"
			};
			res.json(json_response);
			return;
		}

		if (type == "market_direct") 
			query = "SELECT * FROM market_direct_public WHERE" + where + " ORDER BY id " + orderBy + " LIMIT " + quantity + " OFFSET " + offset;
		else if (type == "market")
			query = "SELECT * FROM market_public WHERE" + where + " ORDER BY id " + orderBy + " LIMIT " + quantity + " OFFSET " + offset;
		else if (type == "lotteries")
			query = "SELECT * FROM lottery_public WHERE" + where + " ORDER BY id " + orderBy + " LIMIT " + quantity + " OFFSET " + offset;
		else if (type == "auctions")
			query = "SELECT * FROM auction_public WHERE" + where + " ORDER BY id " + orderBy + " LIMIT " + quantity + " OFFSET " + offset;
		else if (type == "payments")
			query = "SELECT * FROM pay_public WHERE" + where + " ORDER BY id " + orderBy + " LIMIT " + quantity + " OFFSET " + offset;
		else if (type == "heists")
			query = "SELECT * FROM heist_public WHERE" + where + " ORDER BY id " + orderBy + " LIMIT " + quantity + " OFFSET " + offset;
		else {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Tipo cronologia non valido"
			};
			res.json(json_response);
		}

		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			else {
				json_response = {
					"code"  :   200,
					"res"  :   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/shop/', function(req, res) {
	json_response = {
		"code"  :   400,
		"error" :   "ERROR - Inserisci il codice negozio"
	};
	res.json(json_response);
});

api.get('/v2/:token/shop/:code', function(req, res) {
	var code = req.params.code;
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}

		var query;
		if (isNaN(code)){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Codice non valido"
			};
			res.json(json_response);
			return;
		}

		query = "SELECT * FROM shop_public WHERE code = " + escape(code);
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
			}
			if (rows == undefined){
				json_response = {
					"code"  :   400,
					"res"  	:   "ERROR - Nessun risultato"
				};
			}else {
				json_response = {
					"code"  :   200,
					"res"  	:   rows
				};
			}
			res.json(json_response);
			dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
		});
	});
});

api.get('/v2/team/', function(req, res) {
	json_response = {
		"code"  :   400,
		"error" :   "ERROR - Inserisci almeno una parte del nome team"
	};
	res.json(json_response);
});

api.get('/v2/:token/team/:name', function(req, res) {
	var name = req.params.name;
	dbConnection.query("SELECT status FROM token WHERE token = '" + escape(req.params.token) + "'", function (err, rows) {
		if (err) {
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Errore generico"
			};
			res.json(json_response);
			return;
		}
		if (Object.keys(rows).length == 0){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token non valido o non specificato"
			};
			res.json(json_response);
			return;
		}
		if (rows[0].status == "REVOKED"){
			json_response = {
				"code"  :   400,
				"error" :   "ERROR - Token revocato"
			};
			res.json(json_response);
			return;
		}
		var query;
		
		query = "SELECT team_id, name, child_team, pnt FROM team_public WHERE (team_id != 1113 OR team_id IS NULL) AND name LIKE '%" + escape(name) + "%'";
		dbConnection.query(query, function(err, rows) {
			if (err) {
				json_response = {
					"code"  :   400,
					"error" :   err
				};
				res.json(json_response);
			}else if (Object.keys(rows).length == 0){
				json_response = {
					"code"  :   400,
					"res"  	:   "ERROR - Nessun risultato"
				};
				res.json(json_response);
			} else {
				var members;
				query = "SELECT team_id, pnt FROM team_public ORDER BY pnt DESC";
				dbConnection.query(query, async function(err, top) {
					for (var i = 0, len = Object.keys(rows).length; i < len; i++) {
						for (var k = 0, len2 = Object.keys(top).length; k < len2; k++) {
							if (top[k].team_id == rows[i].team_id) {
								rows[i]["position"] = k+1;
								break;
							}
						}
						query = "SELECT player_id, nickname, role FROM team_player_public WHERE team_id = " + rows[i].team_id;
						members = await connection.queryAsync(query);
						rows[i]["members"] = members;
					}
					json_response = {
						"code"  :   200,
						"res"  	:   { rows }
					};
					res.json(json_response);
				});
				dbConnection.query("UPDATE token SET last_query = NOW(), query_num = query_num+1 WHERE token = '" + escape(req.params.token) + "'");
			}
		});
	});
});

module.exports = api;