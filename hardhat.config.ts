import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-typechain';
import '@nomiclabs/hardhat-truffle5';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import '@openzeppelin/hardhat-upgrades';
import 'solidity-coverage';

task('accounts', 'Prints the list of accounts', async (args, hre) => {
	const accounts = await hre.ethers.getSigners();

	for (const account of accounts) {
		console.log(await account.address);
	}
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
	solidity: '0.9.0',
	networks: {
		hardhat: {
			allowUnlimitedContractSize: true,
		},
	},
};
