import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BalanceTree from '../src/balanceTree';
import { parseBalanceMap } from '../src/parseBalanceMap';

// constants
const NAME = 'token';
const SYMBOL = 'TOKEN';
const ZERO_BYTES32 =
	'0x0000000000000000000000000000000000000000000000000000000000000000';

// test accounts
let addr0: SignerWithAddress;
let addr1: SignerWithAddress;

// core contracts
let token: Contract;
let distributor: Contract;

describe('MerkleDistributor', () => {
	beforeEach('deploy token', async () => {
		[addr0, addr1] = await ethers.getSigners();
		const Token = await ethers.getContractFactory('TestERC20');
		token = await Token.deploy(NAME, SYMBOL, 0);
		await token.deployed();
	});

	describe('TOKEN', () => {
		it('returns the token address', async () => {
			const MerkleDistributor = await ethers.getContractFactory(
				'MerkleDistributor'
			);
			distributor = await MerkleDistributor.deploy(
				token.address,
				ZERO_BYTES32
			);
			await distributor.deployed();
			expect(await distributor.token()).to.equal(token.address);
		});
	});

	describe('merkleRoot', () => {
		it('returns the zero merkle root', async () => {
			const MerkleDistributor = await ethers.getContractFactory(
				'MerkleDistributor'
			);
			distributor = await MerkleDistributor.deploy(
				token.address,
				ZERO_BYTES32
			);
			await distributor.deployed();
			expect(await distributor.merkleRoot()).to.equal(ZERO_BYTES32);
		});
	});

	describe('claim', () => {
		it('fails for empty proof', async () => {
			const MerkleDistributor = await ethers.getContractFactory(
				'MerkleDistributor'
			);
			distributor = await MerkleDistributor.deploy(
				token.address,
				ZERO_BYTES32
			);
			await distributor.deployed();
			await expect(
				distributor.claim(0, addr0.address, 10, [])
			).to.be.revertedWith('MerkleDistributor: Invalid proof.');
		});

		it('fails for invalid index', async () => {
			const MerkleDistributor = await ethers.getContractFactory(
				'MerkleDistributor'
			);
			distributor = await MerkleDistributor.deploy(
				token.address,
				ZERO_BYTES32
			);
			await distributor.deployed();
			await expect(
				distributor.claim(0, addr0.address, 10, [])
			).to.be.revertedWith('MerkleDistributor: Invalid proof.');
		});

		describe('two account tree', () => {
			let tree: BalanceTree;
			beforeEach('deploy', async () => {
				// Build tree with:
				// (1) addresses who can claim TOKEN
				// (2) amount given address can claim
				tree = new BalanceTree([
					{ account: addr0.address, amount: BigNumber.from(100) },
					{ account: addr1.address, amount: BigNumber.from(101) },
				]);

				const MerkleDistributor = await ethers.getContractFactory(
					'MerkleDistributor'
				);
				distributor = await MerkleDistributor.deploy(
					token.address,
					tree.getHexRoot()
				);

				await token.setBalance(distributor.address, 201);
			});

			it('successful claim and transfer', async () => {
				// generate merkle proof for addr0.address
				const proof0 = tree.getProof(0, addr0.address, BigNumber.from(100));

				// addr0 claims TOKEN
				await expect(distributor.claim(0, addr0.address, 100, proof0))
					.to.emit(distributor, 'Claimed')
					.withArgs(0, addr0.address, 100);
				expect(await token.balanceOf(addr0.address)).to.equal(100);

				// generate merkle proof for addr1.address
				const proof1 = tree.getProof(1, addr1.address, BigNumber.from(101));
				// addr1 claims TOKEN
				await expect(distributor.claim(1, addr1.address, 101, proof1))
					.to.emit(distributor, 'Claimed')
					.withArgs(1, addr1.address, 101);
				expect(await token.balanceOf(addr1.address)).to.equal(101);

				expect(await token.balanceOf(distributor.address)).to.equal(0);
			});

			it('must have enough to transfer', async () => {
				// generate merkle proof for addr0.address
				const proof0 = tree.getProof(0, addr0.address, BigNumber.from(100));
				await token.setBalance(distributor.address, 99);
				// addr0 claims TOKEN
				await expect(
					distributor.claim(0, addr0.address, 100, proof0)
				).to.be.revertedWith('ERC20: transfer amount exceeds balance');
			});

			it('sets #isClaimed', async () => {
				// generate merkle proof for addr0.address
				const proof0 = tree.getProof(0, addr0.address, BigNumber.from(100));

				expect(await distributor.isClaimed(0)).to.equal(false);
				expect(await distributor.isClaimed(1)).to.equal(false);

				// addr0 claims TOKEN
				await distributor.claim(0, addr0.address, 100, proof0);

				expect(await distributor.isClaimed(0)).to.equal(true);
				expect(await distributor.isClaimed(1)).to.equal(false);
			});

			it('cannot allow two claims', async () => {
				// generate merkle proof for addr0.address
				const proof0 = tree.getProof(0, addr0.address, BigNumber.from(100));
				// addr0 claims TOKEN
				await distributor.claim(0, addr0.address, 100, proof0);
				// addr0 attempts to claim TOKEN (again)
				await expect(
					distributor.claim(0, addr0.address, 100, proof0)
				).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
			});

			it('cannot claim more than once: (index) 0 and then 1', async () => {
				// addr0 claims TOKEN
				await distributor.claim(
					0,
					addr0.address,
					100,
					tree.getProof(0, addr0.address, BigNumber.from(100))
				);

				// addr1 claims TOKEN
				await distributor.claim(
					1,
					addr1.address,
					101,
					tree.getProof(1, addr1.address, BigNumber.from(101))
				);

				// addr0 attempts to claim TOKEN (again)
				await expect(
					distributor.claim(
						0,
						addr0.address,
						100,
						tree.getProof(0, addr0.address, BigNumber.from(100))
					)
				).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
			});

			it('cannot claim more than once: (index) 1 and then 0', async () => {
				// addr1 claims TOKEN
				await distributor.claim(
					1,
					addr1.address,
					101,
					tree.getProof(1, addr1.address, BigNumber.from(101))
				);

				// addr0 claims TOKEN
				await distributor.claim(
					0,
					addr0.address,
					100,
					tree.getProof(0, addr0.address, BigNumber.from(100))
				);

				// addr1 attempts to claim TOKEN (again)
				await expect(
					distributor.claim(
						1,
						addr1.address,
						101,
						tree.getProof(1, addr1.address, BigNumber.from(101))
					)
				).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
			});

			it('cannot claim for address other than proof', async () => {
				// generate merkle proof for addr0.address
				const proof0 = tree.getProof(0, addr0.address, BigNumber.from(100));

				// addr1 attempts to claim TOKEN with addr0's proof
				await expect(
					distributor.claim(1, addr1.address, 101, proof0)
				).to.be.revertedWith('MerkleDistributor: Invalid proof.');
			});

			it('cannot claim more than proof', async () => {
				// generate merkle proof for addr0.address
				const proof0 = tree.getProof(0, addr0.address, BigNumber.from(100));

				// addr0 attempts to claim MORE TOKEN than proof specifies
				await expect(
					distributor.claim(0, addr0.address, 101, proof0)
				).to.be.revertedWith('MerkleDistributor: Invalid proof.');
			});

			it('gas', async () => {
				// generate proof and claim for addr0
				const proof = tree.getProof(0, addr0.address, BigNumber.from(100));
				const tx = await distributor.claim(0, addr0.address, 100, proof);
				const receipt = await tx.wait();

				expect(receipt.gasUsed).to.equal(84551);
			});
		});

		describe('larger tree', () => {
			let tree: BalanceTree;
			let accounts: SignerWithAddress[];

			beforeEach('deploy', async () => {
				accounts = await ethers.getSigners();

				// Build tree with:
				// (1) all signers provided by ethers.getSigners()
				tree = new BalanceTree(
					accounts.map((account, ix) => {
						return {
							account: account.address,
							amount: BigNumber.from(ix + 1),
						};
					})
				);

				const MerkleDistributor = await ethers.getContractFactory(
					'MerkleDistributor'
				);
				distributor = await MerkleDistributor.deploy(
					token.address,
					tree.getHexRoot()
				);
				await distributor.deployed();
				await token.setBalance(distributor.address, 201);
			});

			it('claim index 4', async () => {
				// generate merkle proof
				const proof = tree.getProof(
					4,
					accounts[4].address,
					BigNumber.from(5)
				);

				// claim based on proof and index
				await expect(distributor.claim(4, accounts[4].address, 5, proof))
					.to.emit(distributor, 'Claimed')
					.withArgs(4, accounts[4].address, 5);
			});

			it('claim index 9', async () => {
				// generate merkle proof
				const proof = tree.getProof(
					9,
					accounts[9].address,
					BigNumber.from(10)
				);

				// claim based on proof and index
				await expect(distributor.claim(9, accounts[9].address, 10, proof))
					.to.emit(distributor, 'Claimed')
					.withArgs(9, accounts[9].address, 10);
			});

			it('gas', async () => {
				const proof = tree.getProof(
					9,
					accounts[9].address,
					BigNumber.from(10)
				);
				const tx = await distributor.claim(
					9,
					accounts[9].address,
					10,
					proof
				);
				const receipt = await tx.wait();
				expect(receipt.gasUsed).to.eq(88193);
			});

			it('gas second down about 15k', async () => {
				await distributor.claim(
					0,
					accounts[0].address,
					1,
					tree.getProof(0, accounts[0].address, BigNumber.from(1))
				);
				const tx = await distributor.claim(
					1,
					accounts[1].address,
					2,
					tree.getProof(1, accounts[1].address, BigNumber.from(2))
				);
				const receipt = await tx.wait();
				expect(receipt.gasUsed).to.eq(71093);
			});
		});

		describe('realistic size tree', () => {
			let tree: BalanceTree;
			const NUM_LEAVES = 100_000;
			const NUM_SAMPLES = 25;
			const elements: { account: string; amount: BigNumber }[] = [];

			let addr0Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

			for (let i = 0; i < NUM_LEAVES; i++) {
				const node = {
					account: addr0Address,
					amount: BigNumber.from(100),
				};
				elements.push(node);
			}

			tree = new BalanceTree(elements);

			it('proof verification works', () => {
				const root = Buffer.from(tree.getHexRoot().slice(2), 'hex');
				for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
					const proof = tree
						.getProof(i, addr0.address, BigNumber.from(100))
						.map((el) => Buffer.from(el.slice(2), 'hex'));
					const validProof = BalanceTree.verifyProof(
						i,
						addr0.address,
						BigNumber.from(100),
						proof,
						root
					);
					expect(validProof).to.be.true;
				}
			});

			beforeEach('deploy', async () => {
				const MerkleDistributor = await ethers.getContractFactory(
					'MerkleDistributor'
				);
				distributor = await MerkleDistributor.deploy(
					token.address,
					tree.getHexRoot()
				);
				await distributor.deployed();
				await token.setBalance(distributor.address, constants.MaxUint256);
			});

			it('gas', async () => {
				const proof = tree.getProof(
					50000,
					addr0.address,
					BigNumber.from(100)
				);
				const tx = await distributor.claim(
					50000,
					addr0.address,
					100,
					proof
				);
				const receipt = await tx.wait();
				expect(receipt.gasUsed).to.eq(99094);
			});

			it('gas deeper node', async () => {
				const proof = tree.getProof(
					90000,
					addr0.address,
					BigNumber.from(100)
				);
				const tx = await distributor.claim(
					90000,
					addr0.address,
					100,
					proof
				);
				const receipt = await tx.wait();
				expect(receipt.gasUsed).to.eq(99146);
			});

			it('gas average random distribution', async () => {
				let total: BigNumber = BigNumber.from(0);
				let count: number = 0;
				for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
					const proof = tree.getProof(
						i,
						addr0.address,
						BigNumber.from(100)
					);
					const tx = await distributor.claim(i, addr0.address, 100, proof);
					const receipt = await tx.wait();
					total = total.add(receipt.gasUsed);
					count++;
				}
				const average = total.div(count);
				expect(average).to.eq(82520);
			});

			// this is what we gas golfed by packing the bitmap
			it('gas average first 25', async () => {
				let total: BigNumber = BigNumber.from(0);
				let count: number = 0;
				for (let i = 0; i < 25; i++) {
					const proof = tree.getProof(
						i,
						addr0.address,
						BigNumber.from(100)
					);
					const tx = await distributor.claim(i, addr0.address, 100, proof);
					const receipt = await tx.wait();
					total = total.add(receipt.gasUsed);
					count++;
				}
				const average = total.div(count);
				expect(average).to.eq(66268);
			});

			it('no double claims in random distribution', async () => {
				for (
					let i = 0;
					i < 25;
					i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))
				) {
					const proof = tree.getProof(
						i,
						addr0.address,
						BigNumber.from(100)
					);
					await distributor.claim(i, addr0.address, 100, proof);
					await expect(
						distributor.claim(i, addr0.address, 100, proof)
					).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
				}
			});
		});
	});

	describe('parseBalanceMap', () => {
		let accounts: SignerWithAddress[];

		let claims: {
			[account: string]: {
				index: number;
				amount: string;
				proof: string[];
			};
		};

		beforeEach('deploy', async () => {
			accounts = await ethers.getSigners();

			const {
				claims: innerClaims,
				merkleRoot,
				tokenTotal,
			} = parseBalanceMap({
				[accounts[0].address]: 200,
				[accounts[1].address]: 300,
				[accounts[2].address]: 250,
			});

			expect(tokenTotal).to.equal('0x02ee'); // 750

			claims = innerClaims;

			const MerkleDistributor = await ethers.getContractFactory(
				'MerkleDistributor'
			);
			distributor = await MerkleDistributor.deploy(
				token.address,
				merkleRoot
			);
			await distributor.deployed();
			await token.setBalance(distributor.address, tokenTotal);
		});

		it('all claims work exactly once', async () => {
			for (let account in claims) {
				const claim = claims[account];
				await expect(
					distributor.claim(
						claim.index,
						account,
						claim.amount,
						claim.proof
					)
				)
					.to.emit(distributor, 'Claimed')
					.withArgs(claim.index, account, claim.amount);
				await expect(
					distributor.claim(
						claim.index,
						account,
						claim.amount,
						claim.proof
					)
				).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
			}
			expect(await token.balanceOf(distributor.address)).to.equal(0);
		});
	});
});
