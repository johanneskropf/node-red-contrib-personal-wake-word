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
    
    function WakeWordNode (config) {
        
        RED.nodes.createNode(this,config);
        
        this.statusTimer = false;
        this.inputTimeout = false;
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
        
        async function startDetector () {
            
            node.detector = new wakewordDetector ({
                threshold: 0.5 // Default value
            });
            
            await node.detector.addKeyword("test", node.wakeWordConfig.files, {
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
                msg[node.outputProp].keyword = keyword;
                msg[node.outputProp].timestamp = timestamp;
                msg[node.outputProp].score = score;
                msg[node.outputProp].threshold = threshold;
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
        
        node.on('input', function(msg, send, done) {
            
            const input = RED.util.getMessageProperty(msg, node.inputProp);
            
            if (Buffer.isBuffer(input)) {
                if (!node.detector) {
                    node_status(["starting detector","blue","ring"]);
                    startDetector();
                } else {
                    writeChunk(input);
                    inputTimeoutTimer();
                }
            }
            if (done) { done(); }
            
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