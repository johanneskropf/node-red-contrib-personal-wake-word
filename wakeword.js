/**
 * Copyright 2021 Johannes Kropf
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    
    const wakewordDetector = require("node-personal-wakeword");
    const fs = require("fs");
    const path = require("path");
    
    function WakeWordNode (config) {
        
        RED.nodes.createNode(this,config);
        
        this.statusTimer = false;
        this.inputTimeout = false;
        this.errorStop = false;
        this.files = [];
        this.threshold = Number(config.threshold);
        this.averaging = (config.averaging === true) ? false : true;
        this.inputProp = config.inputProp || "payload";
        this.outputProp = config.outputProp || "payload";
        this.wakeWordConfig = RED.nodes.getNode(config.wakeword);
        
        var node = this;
        
        function node_status(state1 = [], timeout = 0, state2 = []){
            
            if (state1.length !== 0) {
                node.status({fill:state1[1],shape:state1[2],text:state1[0]});
            } else {
                node.status({});
            }
            
            if (node.statusTimer !== false) {
                clearTimeout(node.statusTimer);
                node.statusTimer = false;
            }
            
            if (timeout !== 0) {
                node.statusTimer = setTimeout(() => {
                
                    if (state2.length !== 0) {
                        node.status({fill:state2[1],shape:state2[2],text:state2[0]});
                    } else {
                        node.status({});
                    }
                    
                    node.statusTimer = false;
                    
                },timeout);
            }
        }
        
        async function startDetector (input) {
            
            node.detector = new wakewordDetector ({
                threshold: 0.5 // Default value
            });
            
            await node.detector.addKeyword(node.wakeWordConfig.name , input, {
                disableAveraging: node.averaging, 
                threshold: node.threshold
            });
            
            node.detector.on('ready', () => {
                node_status(["listening...","blue","dot"]);
            })
            
            node.detector.on('error', err => {
                node_status(["error","red","dot"],1500);
                node.error(err);
            });
            
            node.detector.on('keyword', ({keyword, score, threshold, timestamp}) => {
                let msg = {};
                const detection = {
                    keyword: keyword,
                    timestamp: timestamp,
                    score: score,
                    threshold: threshold
                };
                msg[node.outputProp] = detection
                node.send(msg);
                node_status(["keyword detected","green","dot"]);
            });
        }
        
        function writeChunk(chunk){
            
            try {
                node.detector.write(chunk);
            }
            catch (error){
                node.error(error);
            }
            return;
            
        }
        
        function inputTimeoutTimer(){
            if (node.inputTimeout !== false) {
                clearTimeout(node.inputTimeout);
                node.inputTimeout = false;
            }
            node.inputTimeout = setTimeout(() => {
                node.detector.destroy();
                node.detector = null;
                node.inputTimeout = false;
                node_status(["stopped","grey","dot"],1500);
            }, 2000);
        }
        
        function checkFiles (input){
            input.forEach(file => {
                if (!fs.existsSync(file)) {
                    node.errorStop = true;
                    node_status(["error","red","dot"]);
                    const errortxt = "please check your paths or files, paths should be to 16 bit , 16000hz, mono wav files containing only the clean wake word audio or to a folder containing them";
                    node.error(errortxt);
                    return;
                }
                if (fs.statSync(file).isDirectory()) {
                    fs.readdir(file, function (err, content) {
                        if (err) {
                            node.errorStop = true;
                            node.error('Unable to scan directory: ' + err);
                            return;
                        }
                        content.forEach(item => {
                            if (item.match(/\.wav$/g) !== null) {
                                let fullPath = path.join(file,item);
                                if (!node.files.includes(fullPath)) { node.files.push(fullPath); }
                            } else {
                                node.warn(`ignoring ${item} as it is not a wav`);
                            }
                        });
                    });
                } else if (file.match(/\.wav$/g) !== null) {
                    if (!node.files.includes(file)) { node.files.push(file); }
                } else {
                    node.warn(`ignoring ${file} as it is neither a folder nor a wav`);
                }
            });
            node_status(["ready","grey","dot"]);
            return;
        }
        
        checkFiles(node.wakeWordConfig.files);
        
        node.on('input', function(msg, send, done) {
            
            if (node.errorStop) {
                if (done) { done(); }
                return;
            }
            
            const input = RED.util.getMessageProperty(msg, node.inputProp);
            
            if (Buffer.isBuffer(input)) {
                if (!node.detector) {
                    node_status(["starting detector","blue","ring"]);
                    startDetector(node.files);
                } else {
                    writeChunk(input);
                    inputTimeoutTimer();
                }
            }
            if (done) { done(); }
            return;
        });
        
        node.on("close",function() {
            clearTimeout(node.inputTimeout);
            node.inputTimeout = false;
            node.detector.destroy();
            node.detector = null;
            clearTimeout(node.statusTimer);
            node.statusTimer = false;
            node.status({});
        });
    
    }
    
    RED.nodes.registerType("wake-word",WakeWordNode);
}