const HRE = require('hardhat');
const { expect } = require("chai");
const CHARITY_WALLET = "0xaf72Fb3310561C0826fdF852c05bC50BF54989cd";
const ADMIN_WALLET = "0x69Ba7E86bbB074Cd5f72693DEb6ADc508D83A6bF";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const panCakeV2RouterAddress = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";

const DECIMAL_ZEROS = "000000000000000000"; // 18 zeros
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

return
describe("Token locker", function() {
    beforeEach(async function () {
        users = await ethers.getSigners();
        const tenEther = ethers.utils.parseEther('50');
        const SeaToken = await ethers.getContractFactory("SeaToken");
        const TokenLocker = await ethers.getContractFactory("TKNLocker");
        tokenLocker = await TokenLocker.deploy();
        seaToken = await SeaToken.deploy();
        this.panCakeRouter = await ethers.getContractAt("IPancakeV2Router02", panCakeV2RouterAddress);

        await seaToken.deployed();
        await tokenLocker.deployed();

        await users[0].sendTransaction({to: ADMIN_WALLET, value: tenEther}); // Send some funds to admin wallet
        await HRE.network.provider.request({method: 'hardhat_impersonateAccount', params: [ADMIN_WALLET]})
        admin = await ethers.provider.getSigner(ADMIN_WALLET);

        await seaToken.connect(admin).transfer(users[0].address, '10000' + DECIMAL_ZEROS);
        await seaToken.connect(admin).approve(panCakeV2RouterAddress, '40000000' + DECIMAL_ZEROS); // 40M to pancake router

        await this.panCakeRouter.connect(admin).addLiquidityETH(seaToken.address, '40000000' + DECIMAL_ZEROS, 0, 0, ADMIN_WALLET, new Date().getTime(), {
            value: ethers.utils.parseEther('40')
        }); // provide 40 BNB + 40M token liquidity to pancakeswap

        await seaToken.connect(admin).transfer(users[2].address, '100000' + DECIMAL_ZEROS);
        await seaToken.connect(admin).burn();
        await tokenLocker.updateToken(seaToken.address);
    });

    it("Should set total lockers to zero", async function() {
        expect(await tokenLocker.totalLockers()).to.be.equal('0'); // 0 lockers
    }); 

    it("Lockup window should be disabled", async function() {
        expect(await tokenLocker.lockupWindow()).to.be.equal(false);
    }); 

    it("Token distribution should not have started", async function() {
        expect(await tokenLocker.tokenDistributionStarted()).to.be.equal(false);
    }); 

    it("Only the owner can enable the lockup window", async function() {
        await expect(tokenLocker.connect(users[1]).enableLockupWindow()).to.be.revertedWith('Ownable: caller is not the owner');
    }); 

    it("Enable lockup window works", async function() {
        expect(await tokenLocker.lockupWindow()).to.be.equal(false);
        await tokenLocker.enableLockupWindow();
        expect(await tokenLocker.lockupWindow()).to.be.equal(true);
    }); 

    it("Only the owner can disable the lockup window", async function() {
        await expect(tokenLocker.connect(users[1]).disableLockupWindow()).to.be.revertedWith('Ownable: caller is not the owner');
    }); 

    it("Disable lockup window works", async function() {
        expect(await tokenLocker.lockupWindow()).to.be.equal(false);
        await tokenLocker.enableLockupWindow();
        expect(await tokenLocker.lockupWindow()).to.be.equal(true);
        await tokenLocker.disableLockupWindow();
        expect(await tokenLocker.lockupWindow()).to.be.equal(false);
    }); 

    it("Should throw error if lockup window is closed", async function() {
        const amount = `15000${DECIMAL_ZEROS}`;
        await seaToken.connect(admin).approve(tokenLocker.address, amount); // 10000 Tokens
        await expect(tokenLocker.connect(admin).lock(amount)).to.be.revertedWith('TL: Lockup window is closed');
    });

    it("Should throw error if tokens are less than 15000", async function() {
        const amount = `10000${DECIMAL_ZEROS}`;
        await seaToken.connect(admin).approve(tokenLocker.address, amount);
        await tokenLocker.enableLockupWindow();
        await expect(tokenLocker.connect(admin).lock(amount)).to.be.revertedWith('Amount cannot be less than 15000 Tokens');
    });

    describe('Creating a locker using token admin account', () => {
        beforeEach(async () => {
            const amount = `16000${DECIMAL_ZEROS}`;
            await seaToken.connect(admin).approve(tokenLocker.address, amount);
            await tokenLocker.enableLockupWindow();
            await tokenLocker.connect(admin).lock(amount);
        });

        it("Total locker increases by 1", async function() {
            expect(await tokenLocker.totalLockers()).to.be.equal('1');
        });

        it("Locker ID set correctly", async function() {
            expectedID = (await tokenLocker.totalLockers()).sub(1);
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerID).to.equal(expectedID);
        });

        it("Locker Token set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.token).to.equal(seaToken.address);
        });

        it("Locker state set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.state).to.equal(1);
        });

        it("Locker owner set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerOwner).to.equal(ADMIN_WALLET);
        });

        it("Locker Tokens claimed set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.tokensClaimed).to.equal(0);
        });
    });

 describe('unlocking locker using admin account', () => {
        beforeEach(async () => {
            const amount = `16000${DECIMAL_ZEROS}`;
            await seaToken.connect(admin).approve(tokenLocker.address, amount);
            await tokenLocker.enableLockupWindow();
            await tokenLocker.connect(admin).lock(amount);
            await tokenLocker.connect(admin).unlockAndCancel()
        });

        it("Total lockers remain the same", async function() {
            expect(await tokenLocker.totalLockers()).to.be.equal('1');
        });

        it("Locker ID set correctly", async function() {
            expectedID = (await tokenLocker.totalLockers()).sub(1);
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerID).to.equal(expectedID);
        });

        it("Locker Token set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.token).to.equal(seaToken.address);
        });

        it("Locker state set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.state).to.equal(2);
        });

        it("Locker owner set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerOwner).to.equal(ADMIN_WALLET);
        });

         it("Locker Tokens claimed become equal to amount", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.tokensClaimed).to.equal(lockerInfo.amount);
        }); 
    });

    describe('Creating a locker using user account', () => {
        beforeEach(async () => {
            const amount = `15000${DECIMAL_ZEROS}`;
            await tokenLocker.enableLockupWindow();
            await seaToken.connect(users[2]).approve(tokenLocker.address, amount);
            await tokenLocker.connect(users[2]).lock(amount);
        });

        it("Total locker increases by 1", async function() {
            expect(await tokenLocker.totalLockers()).to.be.equal('1');
        });

        it("Locker ID set correctly", async function() {
            expectedID = (await tokenLocker.totalLockers()).sub(1);
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            console.log(lockerInfo.amount);
            expect(lockerInfo.lockerID).to.equal(expectedID);
        });

        it("Locker Token set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.token).to.equal(seaToken.address);
        });

        it("Locker state set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.state).to.equal(1);
        });

        it("Locker owner set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerOwner).to.equal(users[2].address);
        });

        it("Locker Tokens claimed set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.tokensClaimed).to.equal(0);
        });
    }); 

    describe('Adding more money to already created locker using user account', () => {
        beforeEach(async () => {
            const amount = `15000${DECIMAL_ZEROS}`;
            await tokenLocker.enableLockupWindow();
            await seaToken.connect(users[2]).approve(tokenLocker.address, amount);
            await tokenLocker.connect(users[2]).lock(amount);
            await seaToken.connect(users[2]).approve(tokenLocker.address, amount);
            await tokenLocker.connect(users[2]).lock(amount);
        });

        it("Total locker increases by 1", async function() {
            expect(await tokenLocker.totalLockers()).to.be.equal('1');
        });

        it("Locker ID set correctly", async function() {
            expectedID = (await tokenLocker.totalLockers()).sub(1);
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            console.log(lockerInfo.amount);
            expect(lockerInfo.lockerID).to.equal(expectedID);
        });

        it("Locker Token set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.token).to.equal(seaToken.address);
        });

        it("Locker state set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.state).to.equal(1);
        });

        it("Locker owner set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerOwner).to.equal(users[2].address);
        });

        it("Locker Tokens claimed set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.tokensClaimed).to.equal(0);
        });
    }); 

    describe('Recreating a locker after cancelling', () => {
        beforeEach(async () => {
            const amount = `15000${DECIMAL_ZEROS}`;
            await tokenLocker.enableLockupWindow();
            await seaToken.connect(users[2]).approve(tokenLocker.address, amount);
            await tokenLocker.connect(users[2]).lock(amount);
            await tokenLocker.connect(users[2]).unlockAndCancel()
            await seaToken.connect(users[2]).approve(tokenLocker.address, amount);
            await tokenLocker.connect(users[2]).lock(amount);
        });

        it("Total locker increases by 1", async function() {
            expect(await tokenLocker.totalLockers()).to.be.equal('1');
        });

        it("Locker ID set correctly", async function() {
            expectedID = (await tokenLocker.totalLockers()).sub(1);
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            console.log(lockerInfo.amount);
            expect(lockerInfo.lockerID).to.equal(expectedID);
        });

        it("Locker Token set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.token).to.equal(seaToken.address);
        });

        it("Locker state set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.state).to.equal(1);
        });

        it("Locker owner set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.lockerOwner).to.equal(users[2].address);
        });

        it("Locker Tokens claimed set correctly", async function() {
            const lockerInfo = await tokenLocker.getLockerInfo(0);
            expect(lockerInfo.tokensClaimed).to.equal(0);
        });
    }); 

/*     it("Should lock some tokens and not allow unlock until appropriate time passes", async function () {

        const amount = `10000${DECIMAL_ZEROS}`;
        const unlocksAt = Math.round(new Date().getTime() / 1000) + 86400; // +1 Day
        await seaToken.connect(admin).approve(tokenLocker.address, amount); // 10000 Tokens
        await tokenLocker.connect(admin).lock(amount, unlocksAt);

        chai.expect((await tokenLocker.getLocker(0))['amount'].toString()).to.be.equal(amount);

        await network.provider.send('evm_increaseTime', [0.5*86400]) // Increase Half day

        await chai.expect(
            tokenLocker.connect(admin).unlock(0)
        ).to.be.revertedWith('TL: Not ready to unlock yet')

        await network.provider.send('evm_increaseTime', [0.5*86400]) // Increase Half day

        await chai.expect(
            tokenLocker.connect(admin).unlock(0)
        ).to.be.revertedWith('TL: Not ready to unlock yet')

        await network.provider.send('evm_increaseTime', [0.5*86400]) // Increase Half day

        const balanceBefore = await seaToken.balanceOf(ADMIN_WALLET);
        await tokenLocker.connect(admin).unlock(0);
        const balanceAfter = await seaToken.balanceOf(ADMIN_WALLET);

        chai.expect(balanceAfter.sub(balanceBefore).toString()).to.be.equal('9579989500000000000000'); // after tax

        await chai.expect(
            tokenLocker.connect(admin).unlock(0)
        ).to.be.revertedWith('TL: already unlocked')
    }); */
});
