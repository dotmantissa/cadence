-include .env

.PHONY: build test deploy deploy-dry clean fmt dev install

# ── Contracts (Foundry) ──────────────────────────────────────────────────────

build:
	cd contracts && forge build

test:
	cd contracts && forge test -vv

fmt:
	cd contracts && forge fmt

clean:
	cd contracts && forge clean

# Deploy PayrollManager to Arc testnet — requires funded USDC wallet
deploy:
	cd contracts && PRIVATE_KEY=$(PRIVATE_KEY) forge script script/Deploy.s.sol \
		--rpc-url $(ARC_RPC_URL) \
		--private-key $(PRIVATE_KEY) \
		--broadcast -vvvv

# Simulate deployment without broadcasting
deploy-dry:
	cd contracts && PRIVATE_KEY=$(PRIVATE_KEY) forge script script/Deploy.s.sol \
		--rpc-url $(ARC_RPC_URL) \
		--private-key $(PRIVATE_KEY) \
		-vvvv

# ── Frontend (Next.js) ───────────────────────────────────────────────────────

install:
	npm install

dev:
	npm run dev

# ── Utilities ────────────────────────────────────────────────────────────────

# Check deployer USDC balance on Arc testnet
balance:
	@cast call $(USDC_ADDRESS) "balanceOf(address)(uint256)" \
		$(DEPLOYER_ADDRESS) --rpc-url $(ARC_RPC_URL) | \
		python3 -c "import sys; v=int(sys.stdin.read().strip()); print(f'Balance: \${ v/1e6:.6f } USDC')"

# Latest Arc block
block:
	@cast block-number --rpc-url $(ARC_RPC_URL)
