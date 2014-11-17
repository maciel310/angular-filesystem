var fileSystem = angular.module('fileSystem',[]);

fileSystem.factory('fileSystem', ['$q', '$timeout', function($q, $timeout) {
	var fsDefer = $q.defer();
	
	var DEFAULT_QUOTA_MB = 0;

	window.resolveLocalFileSystemURL  = window.resolveLocalFileSystemURL || window.webkitResolveLocalFileSystemURL;
	
	window.requestFileSystem = window.webkitRequestFileSystem || window.requestFileSystem;
	window.webkitStorageInfo = window.webkitStorageInfo || {
		requestQuota: function(type, bytes, successFn, errorFn) {
			errorFn(new Error("Not implemented"));
		}
	}
	
	//wrap resolve/reject in an empty $timeout so it happens within the Angular call stack
	//easier than .apply() since no scope is needed and doesn't error if already within an apply
	function safeResolve(deferral, message) {
		$timeout(function() {
			deferral.resolve(message);
		});
	}
	function safeReject(deferral, message) {
		$timeout(function() {
			deferral.reject(message);
		});
	}

	var requestFsFn = function(bytes) {
		window.requestFileSystem(window.PERSISTENT, bytes, function(fs) {
			safeResolve(fsDefer, fs);
		}, function(e){
			safeReject(fsDefer, {text: "Error requesting File System access", obj: e});
		});
	};

	window.webkitStorageInfo.requestQuota(window.PERSISTENT, DEFAULT_QUOTA_MB*1024*1024, function(grantedBytes) {
		if(window.cordova) {
			document.addEventListener('deviceready', function() { requestFsFn(grantedBytes); }, false);
		} else {
			requestFsFn(grantedBytes);
		}
	}, function(e) {
		safeReject(fsDefer, {text: "Error requesting Quota", obj: e});
	});
	
	var fileSystem = {
		isSupported: function() {
			return angular.isDefined(window.webkitStorageInfo);
		},
		getCurrentUsage: function() {
			var def = $q.defer();
			
			webkitStorageInfo.queryUsageAndQuota(window.PERSISTENT, function(used, quota) {
				safeResolve(def, {'used': used, 'quota': quota});
			}, function(e) {
				safeReject(def, {text: "Error getting quota information", obj: e});
			});
			
			return def.promise;
		},
		requestQuota: function(newQuotaMB) {
			var def = $q.defer();
			
			window.webkitStorageInfo.requestQuota(window.PERSISTENT, newQuotaMB*1024*1024, function(grantedBytes) {
				safeResolve(def, grantedBytes);
			}, function(e) {
				safeReject(def, {text: "Error requesting quota increase", obj: e});
			});
			
			return def.promise;
		},
		getFolderContents: function(path) {
			//remove leading slash if present
			path = path.replace(/^\//, "");

			var def = $q.defer();

			function getContent(rootDir, folders) {
				rootDir.getDirectory(folders[0], {}, function(dirEntry) {
					var dirReader = dirEntry.createReader();
					if (folders.length > 1) {
						getContent(dirEntry, folders.slice(1));
					} else {
						dirReader.readEntries(function(entries) {
							safeResolve(def, entries);
						}, function(e) {
							safeReject(def, {text: "Error reading entries", obj: e});
						});
					}
				}, function(e) {
					safeReject(def, {text: "Error getting directory", obj: e});
				});
			}

			fsDefer.promise.then(function(fs) {
				getContent(fs.root, path.split('/'));
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		createFolder: function(path) {
			//remove leading slash if present
			path = path.replace(/^\//, "");
			
			var def = $q.defer();
			
			function createDir(rootDir, folders) {
				rootDir.getDirectory(folders[0], {create: true}, function(dirEntry) {
					if (folders.length > 1) {
						createDir(dirEntry, folders.slice(1));
					} else {
						safeResolve(def, dirEntry);
					}
				}, function(e) {
					safeReject(def, {text: "Error creating directory", obj: e});
				});
			}
			
			fsDefer.promise.then(function(fs) {
				createDir(fs.root, path.split('/'));
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		deleteFolder: function(path, recursive) {
			recursive = (typeof recursive == 'undefined' ? false : recursive);
			
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
				fs.root.getDirectory(path, {}, function(dirEntry) {
					var success = function() {
						safeResolve(def, "");
					};
					var err = function(e) {
						safeReject(def, {text: "Error removing directory", obj: e});
					};
					
					if(recursive) {
						dirEntry.removeRecursively(success, err);
					} else {
						dirEntry.remove(success, err);
					}
				}, function(e) {
					safeReject(def, {text: "Error getting directory", obj: e});
				});
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		writeFileInput: function(filename, file, mimeString) {
			var def = $q.defer();
			
			var reader = new FileReader();
			
			reader.onload = function(e) {
				var buf = e.target.result;
				
				$timeout(function() {
					fileSystem.writeArrayBuffer(filename, buf, mimeString).then(function() {
						safeResolve(def, "");
					}, function(e) {
						safeReject(def, e);
					});
				});
			};
			
			reader.readAsArrayBuffer(file);
			
			return def.promise;
		},
		writeText: function(fileName, contents, append) {
			append = (typeof append == 'undefined' ? false : append);
			
			//create text blob from string
			var blob = new Blob([contents], {type: 'text/plain'});
			
			return fileSystem.writeBlob(fileName, blob, append);
		},
		writeArrayBuffer: function(fileName, buf, mimeString, append) {
			append = (typeof append == 'undefined' ? false : append);
			
			var blob = new Blob([new Uint8Array(buf)], {type: mimeString});
			
			return fileSystem.writeBlob(fileName, blob, append);
		},
		writeBlob: function(fileName, blob, append) {
			append = (typeof append == 'undefined' ? false : append);
			
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
				
				fs.root.getFile(fileName, {create: true}, function(fileEntry) {
					
					fileEntry.createWriter(function(fileWriter) {
						if(append) {
							fileWriter.seek(fileWriter.length);
						}
						
						var truncated = false;
						fileWriter.onwriteend = function(e) {
							//truncate all data after current position
							if (!truncated) {
								truncated = true;
								this.truncate(this.position);
								return;
							}						
							safeResolve(def, "");
						};
						
						fileWriter.onerror = function(e) {
							safeReject(def, {text: 'Write failed', obj: e});
						};
						
						fileWriter.write(blob);
						
					}, function(e) {
						safeReject(def, {text: "Error creating file", obj: e});
					});
					
				}, function(e) {
					safeReject(def, {text: "Error getting file", obj: e});
				});
			
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		getFile: function(fileName) {
			var def = $q.defer();

			this.getFileEntry(fileName).then(function(fileEntry) {
				// Get a File object representing the file,
				fileEntry.file(function(file) {
					safeResolve(def, file);
				}, function(e) {
					safeReject(def, {text: "Error getting file object", obj: e});
				});
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		getFileEntry: function(fileName) {
			var def = $q.defer();

			fsDefer.promise.then(function(fs) {
				fs.root.getFile(fileName, {}, function(fileEntry) {
					safeResolve(def, fileEntry);
				}, function(e) {
					safeReject(def, {text: "Error getting file", obj: e});
				});
			}, function(err) {
				def.reject(err);
			});

			return def.promise;
		},
		/**
		 * @param  String Local filesystem URL.
		 * @return Object Promise with a File argument.
		 */
		getFileFromLocalFileSystemURL: function(url) {
			var def = $q.defer();
			window.resolveLocalFileSystemURL(
				url,
				function(fileEntry) {
					fileEntry.file(
						function(file) {
							safeResolve(def, file);
						}, function(e) {
							safeReject(def, {text: "Error getting file object", obj: e});
						}
					);
				},
				function(e) {
					safeReject(def, {text: "Error resolving FileSystem URL", obj: e});
				}
			);

			return def.promise;
		},
		readFile: function(fileName, returnType) {
			var def = $q.defer();
			
			returnType = returnType || "text";
			
			fsDefer.promise.then(function(fs) {
				fs.root.getFile(fileName, {}, function(fileEntry) {
					// Get a File object representing the file,
					// then use FileReader to read its contents.
					fileEntry.file(function(file) {
						var reader = new FileReader();
						
						reader.onloadend = function() {
							safeResolve(def, this.result);
						};
						
						reader.onerror = function(e) {
							safeReject(def, {text: "Error reading file", obj: e});
						};
						
						
						switch(returnType) {
							case 'arraybuffer':
								reader.readAsArrayBuffer(file);
								break;
							case 'binarystring':
								reader.readAsBinaryString(file);
								break;
							case 'dataurl':
								reader.readAsDataURL(file);
								break;
							default:
								reader.readAsText(file);
						}
					}, function(e) {
						safeReject(def, {text: "Error getting file", obj: e});
					});
				}, function(e) {
					safeReject(def, {text: "Error getting file", obj: e});
				});
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		deleteFile: function(fullPath) {
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
				fs.root.getFile(fullPath, {create:false}, function(fileEntry) {
					fileEntry.remove(function() {
						safeResolve(def, "");
					}, function(e) {
						safeReject(def, {text: "Error deleting file", obj: e});
					});
				});
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		}
	};

	// Keep old name for backwards compatibility
	fileSystem.requestQuotaIncrease = fileSystem.requestQuota;

	return fileSystem;
}]);

