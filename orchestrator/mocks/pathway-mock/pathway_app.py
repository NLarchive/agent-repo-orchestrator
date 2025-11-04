import pathway as pw
import json
import sys
from datetime import datetime

# Basic Pathway ETL application
class PathwayETL:
    def __init__(self):
        self.running = True
    
    def create_sample_pipeline(self):
        """Create a simple demo pipeline"""
        # Define input schema
        class InputSchema(pw.Schema):
            id: int
            value: int
            source: str
        
        # Read from Kafka/source (or simulated CSV for demo)
        try:
            # For demo, we'll just load from a CSV file if it exists
            input_table = pw.io.csv.read(
                "/data/input/",
                schema=InputSchema,
                mode="streaming"
            )
        except:
            # Fallback: create empty table
            input_table = pw.empty_table()
        
        # Apply transformations
        filtered = input_table.filter(input_table.value > 0)
        
        # Aggregate
        aggregated = filtered.reduce(
            count=pw.reducers.count(),
            sum=pw.reducers.sum(filtered.value),
            avg=pw.reducers.avg(filtered.value)
        )
        
        # Output to multiple sinks
        pw.io.csv.write(aggregated, "/data/output/result.csv")
        
        return aggregated
    
    def health_check(self):
        """Simple health endpoint data"""
        return {
            "status": "healthy",
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat()
        }

if __name__ == "__main__":
    etl = PathwayETL()
    print(json.dumps(etl.health_check()))
    sys.stdout.flush()
# Nicolas Larenas, nlarchive
