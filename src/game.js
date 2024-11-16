import 'phaser';

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.GAME_WIDTH = 800;
        this.GAME_HEIGHT = 600;
        this.ROAD_WIDTH = 300;
        this.GRASS_COLOR = 0x2ecc71;
        this.ROAD_COLOR = 0x34495e;
        this.LANE_COLOR = 0xf1c40f;

        // Car physics constants
        this.CAR_ACCELERATION = 0.1; // Reduced from 5
        this.CAR_DECELERATION = 0.99; // Slightly slower deceleration
        this.MAX_SPEED = 9;
        this.MIN_SPEED = -2;

        // New steering constants for gradual steering
        this.STEERING_ACCELERATION = 0.005; // How quickly steering builds up
        this.STEERING_DECELERATION = 0.60; // How quickly steering returns to center
        this.BASE_MAX_STEERING = 0.45;    // Maximum steering at lowest speed
        this.MIN_MAX_STEERING = 0.16;     // Maximum steering at highest speed
        this.CURRENT_STEERING = 0; // Track current steering amount
        this.STEERING_SPEED = 0; // Track steering velocity

        this.AUTO_STRAIGHTEN_SPEED = 0.003;    // Speed of auto-straightening
        this.STRAIGHTEN_DEADZONE = 0.005;      // Threshold to consider car straight
        
        this.TURN_SPEED_REDUCTION = 1.0;

        // Vegetation spawning constants
        this.SPAWN_DISTANCE = -200; // Distance above viewport to spawn
        this.DESPAWN_DISTANCE = 800; // Distance below viewport to despawn
    }

    preload() {
        this.load.image('taxi', 'assets/taxi.png');
        this.load.image('steering-wheel', 'assets/steering-wheel.png');
        
        // Load tree variants
        this.load.image('tree1', 'assets/tree1.png');
        this.load.image('tree2', 'assets/tree2.png');
        this.load.image('tree3', 'assets/tree3.png');
        this.load.image('tree4', 'assets/tree4.png');
        
        // Load bush variants
        this.load.image('bush1', 'assets/bush1.png');
        this.load.image('bush2', 'assets/bush2.png');
    }

    create() {
        // Create depth layers
        this.backgroundLayer = this.add.layer();
        this.roadLayer = this.add.layer();
        this.bushLayer = this.add.layer();
        this.carLayer = this.add.layer();
        this.treeLayer = this.add.layer();
        this.UILayer = this.add.layer();

        // Set layer depths
        this.backgroundLayer.setDepth(0);
        this.roadLayer.setDepth(1);
        this.bushLayer.setDepth(2);
        this.carLayer.setDepth(3);
        this.treeLayer.setDepth(4);
        this.UILayer.setDepth(5);

        // Create the background (grass)
        this.backgroundLayer.add(
            this.add.rectangle(
                this.GAME_WIDTH / 2,
                this.GAME_HEIGHT / 2,
                this.GAME_WIDTH,
                this.GAME_HEIGHT,
                this.GRASS_COLOR
            )
        );

        // Create the road
        const road = this.add.rectangle(
            this.GAME_WIDTH / 2,
            this.GAME_HEIGHT / 2,
            this.ROAD_WIDTH,
            this.GAME_HEIGHT,
            this.ROAD_COLOR
        );
        this.roadLayer.add(road);

        // Create lane markers
        this.laneMarkers = this.add.group();
        const markerCount = 10;
        const markerHeight = 40;
        const markerWidth = 8;
        const gap = 60;

        for (let i = 0; i < markerCount; i++) {
            const marker = this.add.rectangle(
                this.GAME_WIDTH / 2,
                -markerHeight + (i * (markerHeight + gap)),
                markerWidth,
                markerHeight,
                this.LANE_COLOR
            );
            this.roadLayer.add(marker);
            this.laneMarkers.add(marker);
        }

        // Create vegetation groups
        this.vegetation = this.add.group({
            runChildUpdate: true
        });

        this.trees = [];
        this.bushes = [];
        
        // Add vegetation on both sides
        this.createRoadSideVegetation();

        // Set up the player's taxi
        this.player = this.add.sprite(
            this.GAME_WIDTH / 2,
            this.GAME_HEIGHT - 100,
            'taxi'
        );
        this.player.setScale(0.7);
        this.player.setOrigin(0.5, 0.5);
        this.carLayer.add(this.player);

        // Initialize car physics properties
        this.carVelocity = 0;
        this.steeringAngle = 0;
        this.carSpeed = 0;

        this.speedBarBg = this.add.rectangle(
            this.GAME_WIDTH - 50,
            30,
            20,
            100,
            0x333333
        );
        this.speedBarBg.setOrigin(0.5, 0);
        this.UILayer.add(this.speedBarBg);

        this.speedBar = this.add.rectangle(
            this.GAME_WIDTH - 50,
            30,
            20,
            0, // Updated based on speed
            0x00ff00
        );
        this.speedBar.setOrigin(0.5, 0);
        this.UILayer.add(this.speedBar);

        this.speedBar.setDepth(1);
        this.speedBar.setDepth(0);

        // Add steering wheel indicator
        this.steeringWheel = this.add.image(
            this.GAME_WIDTH - 70,
            this.GAME_HEIGHT - 70,
            'steering-wheel'
        );
        this.steeringWheel.setScale(0.15); // Adjust scale as needed
        this.UILayer.add(this.steeringWheel);

        // Enable physics on the player
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);
        
        const roadLeftBound = (this.GAME_WIDTH - this.ROAD_WIDTH) / 2;
        const roadRightBound = roadLeftBound + this.ROAD_WIDTH;
        
        this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(
            roadLeftBound,
            0,
            this.ROAD_WIDTH,
            this.GAME_HEIGHT
        ));

        this.cursors = this.input.keyboard.createCursorKeys();
        this.markerSpeed = 3;
        this.roadScroll = 0;
    }

    createRoadSideVegetation() {
        const roadCenter = this.GAME_WIDTH / 2;
        const roadEdge = this.ROAD_WIDTH / 2;
        
        // Create more initial vegetation to fill the scene
        this.createVegetationLayer(roadCenter - roadEdge - 150, -8, 8, 'left');
        this.createVegetationLayer(roadCenter + roadEdge + 150, -8, 8, 'right');
    }

    createVegetationLayer(baseX, startY, count, side) {
        const treeTypes = ['tree1', 'tree2', 'tree3', 'tree4'];
        const bushTypes = ['bush1', 'bush2'];
        
        for (let i = startY; i < count; i++) {
            const xOffset = Phaser.Math.Between(-30, 30);
            const ySpacing = 250;
            const y = i * ySpacing + this.SPAWN_DISTANCE;

            // Add bushes
            if (Phaser.Math.Between(0, 10) > 6) {
                const bushType = bushTypes[Phaser.Math.Between(0, bushTypes.length - 1)];
                const bush = this.add.image(baseX + xOffset, y, bushType);
                const scale = Phaser.Math.FloatBetween(0.4, 0.5);
                bush.setScale(scale);
                bush.initialX = baseX; // Store initial X for recycling
                this.bushLayer.add(bush);
                this.bushes.push(bush);
                this.vegetation.add(bush);
            }

            // Add trees
            if (Phaser.Math.Between(0, 10) > 4) {
                const treeType = treeTypes[Phaser.Math.Between(0, treeTypes.length - 1)];
                const tree = this.add.image(baseX + xOffset, y, treeType);
                const scale = Phaser.Math.FloatBetween(0.4, 0.5);
                tree.setScale(scale);
                tree.initialX = baseX; // Store initial X for recycling
                
                // Calculate the root position
                tree.rootY = y + (tree.height * scale / 2);
                this.updateTreeDepth(tree);
                
                this.treeLayer.add(tree);
                this.trees.push(tree);
                this.vegetation.add(tree);
            }
        }
        
        // Sort trees by Y position for proper depth
        this.sortTrees();
    }

    updateTreeDepth(tree) {
        // Set depth based on Y position
        // Multiply by 100 to ensure enough depth resolution
        tree.setDepth(tree.rootY * 100);
    }

    sortTrees() {
        // Sort trees array by Y position
        this.trees.sort((a, b) => a.rootY - b.rootY);
        
        // Update depths to ensure proper ordering
        this.trees.forEach((tree, index) => {
            tree.setDepth(index * 100);
        });
    }

    updateCarPhysics() {
        // Update speed with smoother acceleration/deceleration
        if (this.cursors.up.isDown) {
            this.carSpeed += this.CAR_ACCELERATION;
        } else if (this.cursors.down.isDown) {
            this.carSpeed -= this.CAR_ACCELERATION;
        } else {
            // Apply deceleration only when no input
            this.carSpeed *= this.CAR_DECELERATION;
            if (Math.abs(this.carSpeed) < 0.1) this.carSpeed = 0;
        }

        // Clamp speed between MIN_SPEED and MAX_SPEED
        this.carSpeed = Phaser.Math.Clamp(this.carSpeed, this.MIN_SPEED, this.MAX_SPEED);

        // Calculate current maximum steering angle based on speed
        const currentMaxSteering = this.calculateMaxSteering();
        
        // Handle steering input with auto-straigtening
        if (this.cursors.left.isDown) {
            this.STEERING_SPEED -= this.STEERING_ACCELERATION * Math.abs(this.carSpeed / this.MAX_SPEED);
        } else if (this.cursors.right.isDown) {
            this.STEERING_SPEED += this.STEERING_ACCELERATION * Math.abs(this.carSpeed / this.MAX_SPEED);
        } else {
            // Auto-straightening when no steering input
            if (Math.abs(this.carSpeed) > 0.1) { // Only auto-straighten when moving
                // Determine direction to straighten
                const straightenForce = -Math.sign(this.CURRENT_STEERING) * 
                    this.AUTO_STRAIGHTEN_SPEED * 
                    Math.abs(this.carSpeed / this.MAX_SPEED); // Scale with speed
                
                // Apply straightening force if not already straight
                if (Math.abs(this.CURRENT_STEERING) > this.STRAIGHTEN_DEADZONE) {
                    this.STEERING_SPEED += straightenForce;
                } else {
                    // If nearly straight, reset steering completely
                    this.CURRENT_STEERING = 0;
                    this.STEERING_SPEED = 0;
                }
            }

             // Apply normal steering deceleration
             this.STEERING_SPEED *= this.STEERING_DECELERATION;
        }
        
        // Clamp steering speed with dynamic maximum
        this.STEERING_SPEED = Phaser.Math.Clamp(
            this.STEERING_SPEED,
            -currentMaxSteering,
            currentMaxSteering
        );
        
        // Update current steering with dynamic maximum
        this.CURRENT_STEERING += this.STEERING_SPEED;
        this.CURRENT_STEERING = Phaser.Math.Clamp(
            this.CURRENT_STEERING,
            -currentMaxSteering,
            currentMaxSteering
        );

        // Apply steering effects only when moving
        if (Math.abs(this.carSpeed) > 0.1) {
            // Update car rotation based on steering and speed
            const targetRotation = this.CURRENT_STEERING * (this.carSpeed / this.MAX_SPEED);
            
            // Smoothly interpolate current rotation to target rotation
            this.player.rotation = Phaser.Math.Linear(
                this.player.rotation,
                targetRotation,
                0.1 // Adjust this value to change how quickly the car rotates
            );

            // Apply lateral movement based on speed and steering
            const steeringForce = this.CURRENT_STEERING * Math.abs(this.carSpeed);
            this.player.x += steeringForce * 2;
            
            // Apply gentler speed reduction when turning
            if (Math.abs(this.CURRENT_STEERING) > this.MAX_STEERING / 2) {
                this.carSpeed *= this.TURN_SPEED_REDUCTION;
            }
        }

        const wheelRotation = this.CURRENT_STEERING * 10;
        this.steeringWheel.setRotation(wheelRotation);

        this.carVelocity = this.carSpeed;
        this.updateSpeedIndicator();
    }

    calculateMaxSteering() {
        // Calculate dynamic max steering based on speed
        const speedRatio = Math.abs(this.carSpeed) / this.MAX_SPEED;
        return Phaser.Math.Linear(
            this.BASE_MAX_STEERING,
            this.MIN_MAX_STEERING,
            speedRatio
        );
    }

    updateSpeedIndicator() {
        // Calculate speed percentage
        const speedPercent = Math.abs(this.carSpeed) / this.MAX_SPEED;
        
        // Update speed bar height
        const maxHeight = 96;
        this.speedBar.height = speedPercent * maxHeight;
        
        // Update speed bar color based on speed
        const color = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(0x00ff00),
            Phaser.Display.Color.ValueToColor(0xff0000),
            100,
            speedPercent * 100
        );
        this.speedBar.setFillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b));
        
    }
    
    updateRoadElements() {
        this.roadScroll += this.carVelocity;

        // Update lane markers
        this.laneMarkers.getChildren().forEach(marker => {
            marker.y += this.carVelocity;
            if (marker.y > this.GAME_HEIGHT) {
                marker.y = -marker.height;
            }
        });

        // Update vegetation
        this.vegetation.getChildren().forEach(plant => {
            plant.y += this.carVelocity;
            
            // Check if plant has moved beyond despawn point
            if (plant.y > this.DESPAWN_DISTANCE) {
                // Reset to spawn position with slight randomization
                plant.y = this.SPAWN_DISTANCE + Phaser.Math.Between(-20, 20);
                plant.x = plant.initialX + Phaser.Math.Between(-30, 30);
                
                // Update tree depth when recycling
                if (this.trees.includes(plant)) {
                    plant.rootY = plant.y + (plant.height * plant.scale / 2);
                    this.updateTreeDepth(plant);
                    this.sortTrees();
                }
            }
        });
    }

    update() {
        this.updateCarPhysics();
        this.updateRoadElements();
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: MainScene
};

const game = new Phaser.Game(config);