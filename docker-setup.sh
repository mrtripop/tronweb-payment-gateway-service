#!/bin/bash

# Help text
show_help() {
  echo "TRON USDT Payment Gateway Docker Setup"
  echo ""
  echo "Usage: ./docker-setup.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -h, --help                Show this help message"
  echo "  -e, --env                 Create .env file from template"
  echo "  -b, --build               Build Docker images"
  echo "  -u, --up                  Start Docker containers"
  echo "  -d, --down                Stop Docker containers"
  echo "  -r, --restart             Restart Docker containers"
  echo ""
  echo "Examples:"
  echo "  ./docker-setup.sh --env   Create .env file"
  echo "  ./docker-setup.sh --up    Start the application"
  echo ""
}

# Create .env file from template
create_env_file() {
  if [ -f .env ]; then
    echo "Warning: .env file already exists. Do you want to overwrite it? (y/n)"
    read answer
    if [ "$answer" != "y" ]; then
      echo "Aborted."
      return
    fi
  fi
  
  echo "Creating .env file..."
  
  # Create .env file
  cat > .env << EOL
# Server settings
PORT=3000
NODE_ENV=production

# MongoDB connection (pre-configured for Docker)
MONGO_URI=mongodb://admin:password@mongodb:27017/tron-payment-gateway?authSource=admin

# TRON network settings
TRON_FULL_HOST=https://api.trongrid.io
TRON_PRIVATE_KEY=
MAIN_WALLET_ADDRESS=

# USDT contract address (TRON network)
USDT_CONTRACT_ADDRESS=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
EOL
  
  echo "Please edit the .env file and fill in your TRON wallet private key and main wallet address."
  echo ".env file created successfully!"
}

# Build Docker images
build_docker() {
  echo "Building Docker images..."
  docker-compose build
  echo "Docker images built successfully!"
}

# Start Docker containers
start_docker() {
  echo "Starting Docker containers..."
  docker-compose up -d
  echo "Docker containers started successfully!"
}

# Stop Docker containers
stop_docker() {
  echo "Stopping Docker containers..."
  docker-compose down
  echo "Docker containers stopped successfully!"
}

# Restart Docker containers
restart_docker() {
  echo "Restarting Docker containers..."
  docker-compose restart
  echo "Docker containers restarted successfully!"
}

# Parse arguments
case "$1" in
  -h|--help)
    show_help
    ;;
  -e|--env)
    create_env_file
    ;;
  -b|--build)
    build_docker
    ;;
  -u|--up)
    start_docker
    ;;
  -d|--down)
    stop_docker
    ;;
  -r|--restart)
    restart_docker
    ;;
  *)
    show_help
    ;;
esac

exit 0 