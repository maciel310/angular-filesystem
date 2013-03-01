var fileSystem = angular.module('fileSystem',[]);

fileSystem.factory('fileSystem', ['$q', '$timeout', function($q, $timeout) {
	var fsDefer = $q.defer();
	
	var QUOTA_MB = 5;
	
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

	window.webkitStorageInfo.requestQuota(window.PERSISTENT, QUOTA_MB*1024*1024, function(grantedBytes) {
		window.webkitRequestFileSystem(window.PERSISTENT, grantedBytes, function(fs) {
			safeResolve(fsDefer, fs);
		}, function(e){
			safeReject(fsDefer, "Error requesting File System access");
		});
	}, function(e) {
		safeReject(fsDefer, "Error requesting Quota");
	});
	
	var fileSystem = {
		writeFile: function(fileName, contents, mimeType) {
			var def = $q.defer();
			
			fsDefer.promise.then(function(fs) {
				
				fs.root.getFile(fileName, {create: true}, function(fileEntry) {
					
					// Create a FileWriter object for our FileEntry (log.txt).
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
						
						// Create a new Blob and write it to log.txt.
						var blob = new Blob([contents], {type: mimeType});
						
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
		}
	};
	
	return fileSystem;
}]);

