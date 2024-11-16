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

        this.STEERING_SPEED = 0.1;
        this.MAX_STEERING = 0.15;
        this.STEERING_RECOVERY = 0.95;
        this.TURN_SPEED_REDUCTION = 0.85;
    }

    preload() {
        this.load.image('taxi', 'assets/taxi.png');
        
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
        this.vegetation = this.add.group();
        
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
        
        // Reduced number of vegetation layers
        this.createVegetationLayer(roadCenter - roadEdge - 150, -4, 4, 'left');
        this.createVegetationLayer(roadCenter + roadEdge + 150, -4, 4, 'right');
    }

    createVegetationLayer(baseX, startY, count, side) {
        const treeTypes = ['tree1', 'tree2', 'tree3', 'tree4'];
        const bushTypes = ['bush1', 'bush2'];
        
        for (let i = startY; i < count; i++) {
            const xOffset = Phaser.Math.Between(-30, 30);
            const ySpacing = 250;
            const y = i * ySpacing;

            // Add bushes first (they'll be behind trees)
            if (Phaser.Math.Between(0, 10) > 6) {
                const bushType = bushTypes[Phaser.Math.Between(0, bushTypes.length - 1)];
                const bush = this.add.image(baseX + xOffset, y, bushType);
                const scale = Phaser.Math.FloatBetween(0.4, 0.5);
                bush.setScale(scale);
                this.bushLayer.add(bush);
                this.vegetation.add(bush);
            }

            // Add trees
            if (Phaser.Math.Between(0, 10) > 4) {
                const treeType = treeTypes[Phaser.Math.Between(0, treeTypes.length - 1)];
                const tree = this.add.image(baseX + xOffset, y, treeType);
                const scale = Phaser.Math.FloatBetween(0.4, 0.5);
                tree.setScale(scale);
                
                // Calculate the root position (bottom pixel of the tree)
                const rootY = y + (tree.height * scale / 2);
                tree.setDepth(rootY);
                
                this.treeLayer.add(tree);
                this.vegetation.add(tree);
                
                // Store the root Y position for recycling
                tree.rootY = rootY;
            }
        }
    }

    update() {
        this.updateCarPhysics();
        this.updateRoadElements();
    }

    updateCarPhysics() {
        if (this.cursors.up.isDown) {
            this.carSpeed = Math.min(this.carSpeed + this.CAR_ACCELERATION, this.MAX_SPEED);
        } else if (this.cursors.down.isDown) {
            this.carSpeed = Math.max(this.carSpeed - this.CAR_ACCELERATION, -this.MAX_SPEED / 2);
        } else {
            this.carSpeed *= this.CAR_DECELERATION;
        }

        if (this.cursors.left.isDown) {
            this.steeringAngle = Math.max(
                this.steeringAngle - this.STEERING_SPEED,
                -this.MAX_STEERING
            );
        } else if (this.cursors.right.isDown) {
            this.steeringAngle = Math.min(
                this.steeringAngle + this.STEERING_SPEED,
                this.MAX_STEERING
            );
        } else {
            this.steeringAngle *= this.STEERING_RECOVERY;
        }

        if (Math.abs(this.carSpeed) > 0.1) {
            this.player.rotation = this.steeringAngle * (this.carSpeed / this.MAX_SPEED);
            this.player.x += this.steeringAngle * this.carSpeed * 3;
        }

        this.carVelocity = this.carSpeed;

        this.updateSpeedIndicator();
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

        this.laneMarkers.getChildren().forEach(marker => {
            marker.y += this.carVelocity;
            if (marker.y > this.GAME_HEIGHT) {
                marker.y = -marker.height;
            }
        });

        this.vegetation.getChildren().forEach(plant => {
            plant.y += this.carVelocity;
            if (plant.y > this.GAME_HEIGHT + 100) {
                plant.y = -100 + Phaser.Math.Between(-20, 20);
                plant.x += Phaser.Math.Between(-10, 10);
                
                // Update tree depth when recycling using root position
                if (this.treeLayer.list.includes(plant)) {
                    // Recalculate root Y position
                    plant.rootY = plant.y + (plant.height * plant.scale * 0.5);
                    plant.setDepth(plant.rootY);
                }
            }
        });
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