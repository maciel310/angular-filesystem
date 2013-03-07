var fileSystem = angular.module('fileSystem',[]);

fileSystem.factory('fileSystem', ['$q', '$timeout', function($q, $timeout) {
	var fsDefer = $q.defer();
	
	var DEFAULT_QUOTA_MB = 0;
	
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

	window.webkitStorageInfo.requestQuota(window.PERSISTENT, DEFAULT_QUOTA_MB*1024*1024, function(grantedBytes) {
		window.webkitRequestFileSystem(window.PERSISTENT, grantedBytes, function(fs) {
			safeResolve(fsDefer, fs);
		}, function(e){
			safeReject(fsDefer, "Error requesting File System access");
		});
	}, function(e) {
		safeReject(fsDefer, "Error requesting Quota");
	});
	
	var fileSystem = {
		getCurrentUsage: function() {
			var def = $q.defer();
			
			webkitStorageInfo.queryUsageAndQuota(window.PERSISTENT, function(used, quota) {
				safeResolve(def, {'used': used, 'quota': quota});
			}, function(e) {
				safeReject(def, "Error getting quota information");
			});
			
			return def.promise;
		},
		requestQuotaIncrease: function(newQuotaMB) {
			var def = $q.defer();
			
			window.webkitStorageInfo.requestQuota(window.PERSISTENT, newQuotaMB*1024*1024, function(grantedBytes) {
				safeResolve(def, grantedBytes);
			}, function(e) {
				safeReject(def, "Error requesting quota increase");
			});
			
			return def.promise;
		},
		getFolderContents: function(dir) {
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
				fs.root.getDirectory(fs.root.fullPath + dir, {}, function(dirEntry) {
					var dirReader = dirEntry.createReader();
					dirReader.readEntries(function(entries) {
						safeResolve(def, entries);
					}, function(e) {
						safeReject(def, "Error reading entries");
					});
				}, function(e) {
					safeReject(def, "Error getting directory");
				});
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
					if (folders.length) {
						createDir(dirEntry, folders.slice(1));
					} else {
						safeResolve(def, dirEntry);
					}
				}, function(e) {
					safeReject(def, "Error creating directory");
				});
			}
			
			fsDefer.promise.then(function(fs) {
				createDir(fs.root, path.split('/'));
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		writeText: function(fileName, contents) {
			//create text blob from string
			var blob = new Blob([contents], {type: 'text/plain'});
			
			return fileSystem.writeBlob(fileName, blob);
		},
		writeArrayBuffer: function(fileName, buf, mimeString) {
			var blob = new Blob([new Uint8Array(buf)], {type: mimeString});
			
			return fileSystem.writeBlob(fileName, blob);
		},
		writeBlob: function(fileName, blob) {
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
				
				fs.root.getFile(fileName, {create: true}, function(fileEntry) {
					
					fileEntry.createWriter(function(fileWriter) {
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
							safeReject(def, 'Write failed: ' + e.toString());
						};
						
						fileWriter.write(blob);
						
					}, function(e) {
						safeReject(def, "Error creating file");
					});
					
				}, function(e) {
					safeReject(def, "Error getting file");
				});
			
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		appendToFile: function(fileName, contents, mimeType) {
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
			
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		},
		readFile: function(fileName) {
			var def = $q.defer();
			
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
							safeReject(def, "Error reading file");
						};
						
						reader.readAsText(file);
					}, function(e) {
						safeReject(def, "Error getting file");
					});
				}, function(e) {
					safeReject(def, "Error getting file");
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
					}, function(err) {
						safeReject(def, err);
					});
				});
			}, function(err) {
				def.reject(err);
			});
			
			return def.promise;
		}
	};
	
	return fileSystem;
}]);

