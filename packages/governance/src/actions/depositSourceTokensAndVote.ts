import {
  Account,
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  contexts,
  utils,
  models,
  ParsedAccount,
  actions,
} from '@oyster/common';

import {
  GOVERNANCE_AUTHORITY_SEED,
  Governance,
  Proposal,
  ProposalState,
} from '../models/governance';

import { AccountLayout } from '@solana/spl-token';

import { LABELS } from '../constants';

import { depositSourceTokensInstruction } from '../models/depositSourceTokens';
import { createEmptyGovernanceVotingRecordInstruction } from '../models/createEmptyGovernanceVotingRecord';
import { voteInstruction } from '../models/vote';

const { createTokenAccount } = actions;
const { sendTransactions, SequenceType } = contexts.Connection;
const { notify } = utils;
const { approve } = models;

export const depositSourceTokensAndVote = async (
  connection: Connection,
  wallet: any,
  proposal: ParsedAccount<Proposal>,
  existingVoteAccount: PublicKey | undefined,
  existingYesVoteAccount: PublicKey | undefined,
  existingNoVoteAccount: PublicKey | undefined,
  sourceAccount: PublicKey,
  governance: ParsedAccount<Governance>,
  state: ParsedAccount<ProposalState>,
  yesVotingTokenAmount: number,
  noVotingTokenAmount: number,
) => {
  const votingTokenAmount =
    yesVotingTokenAmount > 0 ? yesVotingTokenAmount : noVotingTokenAmount;

  const PROGRAM_IDS = utils.programIds();

  let depositSigners: Account[] = [];
  let depositInstructions: TransactionInstruction[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span,
  );

  let needToCreateGovAccountToo = !existingVoteAccount;
  if (!existingVoteAccount) {
    existingVoteAccount = createTokenAccount(
      depositInstructions,
      wallet.publicKey,
      accountRentExempt,
      proposal.info.votingMint,
      wallet.publicKey,
      depositSigners,
    );
  }

  const [governanceVotingRecord] = await PublicKey.findProgramAddress(
    [
      Buffer.from(GOVERNANCE_AUTHORITY_SEED),
      PROGRAM_IDS.governance.programId.toBuffer(),
      proposal.pubkey.toBuffer(),
      existingVoteAccount.toBuffer(),
    ],
    PROGRAM_IDS.governance.programId,
  );

  if (needToCreateGovAccountToo) {
    depositInstructions.push(
      createEmptyGovernanceVotingRecordInstruction(
        governanceVotingRecord,
        proposal.pubkey,
        existingVoteAccount,
        wallet.publicKey,
      ),
    );
  }

  if (!existingYesVoteAccount) {
    existingYesVoteAccount = createTokenAccount(
      depositInstructions,
      wallet.publicKey,
      accountRentExempt,
      proposal.info.yesVotingMint,
      wallet.publicKey,
      depositSigners,
    );
  }

  if (!existingNoVoteAccount) {
    existingNoVoteAccount = createTokenAccount(
      depositInstructions,
      wallet.publicKey,
      accountRentExempt,
      proposal.info.noVotingMint,
      wallet.publicKey,
      depositSigners,
    );
  }

  const [mintAuthority] = await PublicKey.findProgramAddress(
    [Buffer.from(GOVERNANCE_AUTHORITY_SEED), proposal.pubkey.toBuffer()],
    PROGRAM_IDS.governance.programId,
  );

  const depositAuthority = approve(
    depositInstructions,
    [],
    sourceAccount,
    wallet.publicKey,
    votingTokenAmount,
  );

  depositSigners.push(depositAuthority);

  depositInstructions.push(
    depositSourceTokensInstruction(
      governanceVotingRecord,
      existingVoteAccount,
      sourceAccount,
      proposal.info.sourceHolding,
      proposal.info.votingMint,
      proposal.pubkey,
      depositAuthority.publicKey,
      mintAuthority,
      votingTokenAmount,
    ),
  );

  let voteSigners: Account[] = [];
  let voteInstructions: TransactionInstruction[] = [];

  const voteAuthority = approve(
    voteInstructions,
    [],
    existingVoteAccount,
    wallet.publicKey,
    yesVotingTokenAmount + noVotingTokenAmount,
  );

  voteSigners.push(voteAuthority);

  voteInstructions.push(
    voteInstruction(
      governanceVotingRecord,
      state.pubkey,
      existingVoteAccount,
      existingYesVoteAccount,
      existingNoVoteAccount,
      proposal.info.votingMint,
      proposal.info.yesVotingMint,
      proposal.info.noVotingMint,
      proposal.info.sourceMint,
      proposal.pubkey,
      governance.pubkey,
      voteAuthority.publicKey,
      mintAuthority,
      yesVotingTokenAmount,
      noVotingTokenAmount,
    ),
  );

  const [votingMsg, votedMsg, voteTokensMsg] =
    yesVotingTokenAmount > 0
      ? [
          LABELS.VOTING_YEAH,
          LABELS.VOTED_YEAH,
          `${yesVotingTokenAmount} ${LABELS.TOKENS_VOTED_FOR_THE_PROPOSAL}.`,
        ]
      : [
          LABELS.VOTING_NAY,
          LABELS.VOTED_NAY,
          `${noVotingTokenAmount} ${LABELS.TOKENS_VOTED_AGAINST_THE_PROPOSAL}.`,
        ];

  notify({
    message: votingMsg,
    description: LABELS.PLEASE_WAIT,
    type: 'warn',
  });

  try {
    await sendTransactions(
      connection,
      wallet,
      [depositInstructions, voteInstructions],
      [depositSigners, voteSigners],
      SequenceType.Sequential,
    );

    notify({
      message: votedMsg,
      type: 'success',
      description: voteTokensMsg,
    });
  } catch (ex) {
    console.error(ex);
    throw new Error();
  }
};
