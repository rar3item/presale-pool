const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('EPFeeManager', () => {
    let creator;
    let addresses;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        addresses = result.addresses.map((s) => s.toLowerCase());
    });

    after(() => {
        server.tearDown();
    });

    function addressEquals(a, b) {
        expect(a.toLowerCase()).to.equal(b.toLowerCase());
    }

    async function payFees(options) {
        let {
            contractAddress,
            FeeManager,
            amount,
            expectedTeamPayout
        } = options;

        let beforeBalance = await FeeManager.methods.teamTotalBalance().call();

        await web3.eth.sendTransaction({
            from: contractAddress,
            to: FeeManager.options.address,
            value: amount,
            gas: 1000000
        });

        let afterBalance = await FeeManager.methods.teamTotalBalance().call();
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedTeamPayout).to.be.within(.98, 1.0);
    }

    async function claimFees(options) {
        let {
            contractAddress,
            recipients,
            FeeManager,
            expectedPayout
        } = options;

        for (let i = 0; i < recipients.length; i++ ) {
            let recipient = recipients[i];
            let beforeBalance = await web3.eth.getBalance(recipient);

            await util.methodWithGas(
                FeeManager.methods.claimFees(contractAddress),
                recipient
            );

            let afterBalance = await web3.eth.getBalance(recipient);
            let difference = parseInt(afterBalance) - parseInt(beforeBalance);
            expect(difference / expectedPayout).to.be.within(.98, 1.0);
        }
    }

    async function distrbuteFees(options) {
        let {
            contractAddress,
            recipients,
            FeeManager,
            expectedPayout
        } = options;

        let beforeBalances = [];
        for (let i = 0; i < recipients.length; i++ ) {
            beforeBalances.push(await web3.eth.getBalance(recipients[i]));
        }

        await util.methodWithGas(
            FeeManager.methods.distrbuteFees(),
            contractAddress
        );

        for (let i = 0; i < recipients.length; i++ ) {
            let beforeBalance = beforeBalances[i];
            let afterBalance = await web3.eth.getBalance(recipients[i]);
            let difference = parseInt(afterBalance) - parseInt(beforeBalance);
            if (expectedPayout > 0) {
                expect(difference / expectedPayout).to.be.within(.98, 1.0);
            } else {
                expect(parseFloat(afterBalance)/ parseFloat(beforeBalance)).to.be.within(.98, 1.0);
            }
        }
    }

    async function createFees(options) {
        let {
            team,
            contractAddress,
            recipients,
            feesPercentage,
            expectedRecipientShare,
        } = options;

        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team]
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                feesPercentage,
                recipients
            ),
            contractAddress
        );

        let fees = await FeeManager.methods.feesForContract(contractAddress).call();
        expect(
            parseFloat(fees.numerator) / parseInt(fees.denominator)
        ).to.be.closeTo(expectedRecipientShare, 0.001);

        return FeeManager;
    }

    async function splitThenclaimTeamMemberFees(options) {
        let {
            team,
            FeeManager,
            expectedPayout,
        } = options;

        await util.methodWithGas(
            FeeManager.methods.splitTeamFees(),
            team[0]
        );

        for (let i = 0; i < team.length; i++ ) {
            let member = team[i];
            let beforeBalance = await web3.eth.getBalance(member);

            await util.methodWithGas(
                FeeManager.methods.claimTeamMemberFees(),
                member
            );

            let afterBalance = await web3.eth.getBalance(member);
            let difference = parseInt(afterBalance) - parseInt(beforeBalance);
            if (expectedPayout > 0) {
                expect(difference / expectedPayout).to.be.within(.98, 1.0);
            } else {
                expect(parseFloat(afterBalance)/ parseFloat(beforeBalance)).to.be.within(.98, 1.0);
            }
        }
    }

    async function splitAndDistributeTeamFees(options) {
        let {
            team,
            FeeManager,
            expectedPayout,
        } = options;


        let beforeBalances = [];
        for (let i = 0; i < team.length; i++ ) {
            beforeBalances.push(await web3.eth.getBalance(team[i]));
        }

        await util.methodWithGas(
            FeeManager.methods.splitAndDistributeTeamFees(),
            team[0]
        );

        for (let i = 0; i < team.length; i++ ) {
            let beforeBalance = beforeBalances[i];
            let afterBalance = await web3.eth.getBalance(team[i]);
            let difference = parseInt(afterBalance) - parseInt(beforeBalance);
            if (expectedPayout > 0) {
                expect(difference / expectedPayout).to.be.within(.98, 1.0);
            } else {
                expect(parseFloat(afterBalance)/ parseFloat(beforeBalance)).to.be.within(.98, 1.0);
            }
        }
    }

    it('must have at least one team member address', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "EPFeeManager",
                creator,
                [[]]
            )
        );
    });

    it('handles duplicate team members', async () => {
        let team = [creator, creator, addresses[1], creator];
        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team]
        );

        addressEquals(await FeeManager.methods.epTeam(0).call(), creator);
        addressEquals(await FeeManager.methods.epTeam(1).call(), addresses[1]);
        await util.expectVMException(
            FeeManager.methods.epTeam(2).call()
        );
    });

    it('feesPercentage must be less than 50%', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.5, "ether"),
                    recipients
                ),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(1.5, "ether"),
                    recipients
                ),
                creator
            )
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei(0.49, "ether"),
                recipients
            ),
            creator
        );
    });

    it('must have at least one fee recipient', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.1, "ether"),
                    []
                ),
                creator
            )
        );
    });

    it('can only create fee structure once', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei(0.1, "ether"),
                recipients
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.1, "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('splits fee to 50-50 when there is only one recipient - claim fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.5,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(2, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await claimFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(1, "ether")
        });

        await util.expectVMException(
            claimFees({
                recipients: recipients,
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(1, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('splits fee to 50-50 when there is only one recipient - distribute fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.5,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(2, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(1, "ether")
        });

        await util.expectVMException(
            claimFees({
                recipients: recipients,
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(1, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('caps team fee to 1% when there is 1 recipient', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.1, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.9,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await claimFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(9, "ether")
        });
    });

    it('recipient share of fee is 25% when there are 3 recipients - claim fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await claimFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await util.expectVMException(
            claimFees({
                recipients: [recipients[1]],
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(0, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('recipient share of fee is 25% when there are 3 recipients - distribute fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await util.expectVMException(
            claimFees({
                recipients: [recipients[1]],
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(0, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('caps team fee to 1% when there is more than 1 recipient', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.1, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.3,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(3, "ether")
        });
    });

    it('splitTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team],
            web3.utils.toWei(3, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.splitTeamFees(),
                addresses[2],
            )
        );
    });

    it('splitAndDistributeTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "EPFeeManager",
            creator,
            [team],
            web3.utils.toWei(3, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.splitAndDistributeTeamFees(),
                addresses[2],
            )
        );
    });

    it('splitThenclaimTeamMemberFees with 1 team member', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipients = [addresses[3], addresses[4], addresses[5]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await splitThenclaimTeamMemberFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await splitAndDistributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });

        await splitThenclaimTeamMemberFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('splitAndDistributeTeamFees with 1 team member', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipients = [addresses[3], addresses[4], addresses[5]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await splitAndDistributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await splitThenclaimTeamMemberFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });

        await splitAndDistributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('splitThenclaimTeamMemberFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6], addresses[7]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await splitThenclaimTeamMemberFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5/3, "ether")
        });

        await splitAndDistributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });

        await splitThenclaimTeamMemberFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('splitAndDistributeTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6], addresses[7]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPercentage: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await splitAndDistributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5/2, "ether")
        });
    });
});

