#!/usr/bin/env python3
"""Simple HTTP server to mock Pathway API for testing"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from datetime import datetime
import sys

class PathwayMockHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = {
                "status": "healthy",
                "version": "1.0.0-mock",
                "uptime": 0,
                "timestamp": datetime.now().isoformat()
            }
            self.wfile.write(json.dumps(response).encode())
        
        elif self.path == '/pipelines':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = [
                {"id": "transform_events", "name": "Event Transformer", "status": "active"},
                {"id": "batch_processor", "name": "Batch Processor", "status": "active"}
            ]
            self.wfile.write(json.dumps(response).encode())
        
        elif self.path == '/metrics':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = {
                "pipelines_active": 2,
                "records_processed": 1000,
                "avg_latency_ms": 15
            }
            self.wfile.write(json.dumps(response).encode())
        
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode() if content_length else '{}'
        
        if '/run' in self.path:
            # Parse request body
            try:
                request_data = json.loads(body)
            except json.JSONDecodeError:
                request_data = {}
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = {
                "success": True,
                "executionId": "exec_" + datetime.now().strftime('%Y%m%d%H%M%S'),
                "status": "running",
                "pipelineId": self.path.split('/')[2] if len(self.path.split('/')) > 2 else "unknown"
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode())
    
    def log_message(self, format, *args):
        sys.stderr.write(f"[PATHWAY-MOCK] {format % args}\n")

if __name__ == '__main__':
    port = 8000
    server = HTTPServer(('0.0.0.0', port), PathwayMockHandler)
    print(f'Starting Pathway mock server on port {port}...', file=sys.stderr)
    sys.stderr.flush()
    server.serve_forever()
# Nicolas Larenas, nlarchive
